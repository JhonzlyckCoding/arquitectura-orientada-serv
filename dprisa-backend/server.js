const express = require('express');
const webpush = require('web-push');
const cors = require('cors');

const app = express();
const db = require('./database'); 

app.use(cors()); 
app.use(express.json()); 

// --- CONFIGURACIÓN DE WEB-PUSH ---
const publicVapidKey = 'BApc8sZjqEMNmgUAoZ8IRRt4v9cJItJCP2IEpoThoU1yqr9FK9Ian3i-GIW457WgWatp3Y_6SP37Fjwov2OPSog';
const privateVapidKey = 'VygJU70G5z4pAU1qr4-sYG-IJFTpluFEZuubXH54oZ0';

webpush.setVapidDetails(
  'mailto:contacto@dprisa.com', 
  publicVapidKey,
  privateVapidKey
);

// ==========================================
//            RUTAS DEL API
// ==========================================

// 1. REGISTRO DE USUARIO
app.post('/api/registro', async (req, res) => {
    const { nombre, correo, contrasena } = req.body;
    try {
        const query = 'INSERT INTO usuarios (nombre, correo, contrasena) VALUES (1$, 2$, 3$) RETURNING id_usuario';
        const resultado = await db.query(query, [nombre, correo, contrasena]);
        res.status(201).json({ success: true, message: 'Usuario registrado', id: resultado.rows[0].id_usuario });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'Este correo ya está registrado.' });
        }
        res.status(500).json({ success: false, message: 'Error en el servidor.' });
    }
});

// 2. LOGIN DE USUARIO
app.post('/api/login', async (req, res) => {
    const { correo, contrasena } = req.body;
    try {
        const query = 'SELECT id_usuario, nombre, correo FROM usuarios WHERE correo = ? AND contrasena = ?';
        const [filas] = await db.query(query, [correo, contrasena]);
        if (filas.length > 0) {
            res.status(200).json({ success: true, message: 'Inicio de sesión exitoso', usuario: filas[0] });
        } else {
            res.status(401).json({ success: false, message: 'Correo o contraseña incorrectos' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error en el servidor.' });
    }
});

// 3. GUARDAR SUSCRIPCIÓN PUSH EN MYSQL
app.post('/api/suscripciones', async (req, res) => {
    const { subscription, id_usuario } = req.body;
    if (!subscription || !id_usuario) {
      return res.status(400).json({ success: false, message: 'Faltan datos de suscripción.' });
    }
    try {
      const query = `
        INSERT INTO suscripciones_push (id_usuario, endpoint, subscription_json) 
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE id_usuario = ?, subscription_json = ?`;
      await db.query(query, [id_usuario, subscription.endpoint, JSON.stringify(subscription), id_usuario, JSON.stringify(subscription)]);
      res.status(201).json({ success: true, message: 'Suscripción guardada.' });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Error interno.' });
    }
});

// 4. CREAR REPORTE Y DISPARAR NOTIFICACIONES PUSH
app.post('/api/reportes/nuevo', async (req, res) => {
  const { tipo, descripcion, fecha_incidente, id_usuario } = req.body;
  
  if (!tipo || !descripcion || !fecha_incidente || !id_usuario) {
    return res.status(400).json({ success: false, message: 'Faltan campos.' });
  }

  try {
    const queryInsert = `INSERT INTO reportes (id_usuario, tipo, descripcion, fecha_incidente) VALUES (?, ?, ?, ?)`;
    const [resultadoDB] = await db.query(queryInsert, [id_usuario, tipo, descripcion, fecha_incidente]);
    
    const [dispositivos] = await db.query('SELECT id_suscripcion, subscription_json FROM suscripciones_push');
    const payload = JSON.stringify({
      title: '¡Alerta en Dprisa!',
      body: `${tipo}: ${descripcion}`,
      icon: 'https://cdn-icons-png.flaticon.com/512/1048/1048314.png',
      url: '/mapa.html'
    });

    const notificaciones = dispositivos.map(disp => {
      const subObjeto = JSON.parse(disp.subscription_json);
      return webpush.sendNotification(subObjeto, payload).catch(async () => {
        await db.query('DELETE FROM suscripciones_push WHERE id_suscripcion = ?', [disp.id_suscripcion]);
      });
    });
    
    await Promise.all(notificaciones);
    res.status(201).json({ success: true, message: 'Reporte guardado.', id_reporte: resultadoDB.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Error en el servidor.' });
  }
});

// 5. LEER HISTORIAL DE REPORTES
app.get('/api/reportes', async (req, res) => {
  try {
    const querySelect = `
      SELECT r.id_reporte, r.tipo, r.descripcion, r.fecha_incidente, u.correo AS usuario 
      FROM reportes r
      JOIN usuarios u ON r.id_usuario = u.id_usuario
      ORDER BY r.fecha_registro DESC`;
    const [listaReportes] = await db.query(querySelect);
    res.status(200).json({ success: true, reportes: listaReportes });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error BD.' });
  }
});

// 6. ELIMINAR UN REPORTE
app.delete('/api/reportes/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM reportes WHERE id_reporte = ?', [id]);
    res.status(200).json({ success: true, message: 'Reporte eliminado.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'No se pudo eliminar.' });
  }
});

// ==========================================
//            INICIAR SERVIDOR
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Microservicio Dprisa ejecutándose en http://localhost:${PORT}`);
});