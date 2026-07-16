const express = require('express');
const webpush = require('web-push');
const cors = require('cors');
const bcrypt = require('bcrypt');

const app = express();
const db = require('./database'); 

app.use(cors()); 
app.use(express.json()); 

// --- CONFIGURACIÓN DE WEB-PUSH ---
const publicVapidKey = process.env.publicVapidKey ? process.env.publicVapidKey.trim() : '';
const privateVapidKey = process.env.privateVapidKey ? process.env.privateVapidKey.trim() : '';

console.log("Llave pública cargada:", publicVapidKey.substring(0, 10) + "...");
console.log("Llave privada cargada:", privateVapidKey.substring(0, 10) + "...");

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
        const hash = await bcrypt.hash(contrasena, 10);

        const query = `

          INSERT INTO usuarios (nombre, correo, contrasena)
          VALUES ($1, $2, $3)
          RETURNING id_usuario

          `;

        const resultado = await db.query(query, [nombre, correo, hash]);

        res.status(201).json({ success: true, message: 'Usuario registrado', id: resultado.rows[0].id_usuario });
    } catch (error) {

        console.error('Error en la BD:', error);

        if (error.code === '23505') { // Código de error para violación de restricción única en PostgreSQL
            return res.status(400).json({ success: false, message: 'Este correo ya está registrado.' });
        }
        res.status(500).json({ success: false, message: 'Error en el servidor.' });
    }
});

// 2. LOGIN DE USUARIO
app.post('/api/login', async (req, res) => {

    const { correo, contrasena } = req.body;

    try {

        const query = `
        SELECT id_usuario,
               nombre,
               correo,
               contrasena
        FROM usuarios
        WHERE correo = $1
        `;

        const resultado = await db.query(query, [correo]);

        if (resultado.rows.length === 0) {

            return res.status(401).json({
                success: false,
                message: 'Correo o contraseña incorrectos'
            });

        }

        const usuario = resultado.rows[0];

        const coincide = await bcrypt.compare(
            contrasena,
            usuario.contrasena
        );

        if (!coincide) {

            return res.status(401).json({
                success: false,
                message: 'Correo o contraseña incorrectos'
            });

        }

        delete usuario.contrasena;

        res.status(200).json({

            success: true,
            message: 'Inicio de sesión exitoso',
            usuario

        });

    } catch (error) {

        console.error(error);

        res.status(500).json({

            success: false,
            message: 'Error en el servidor.'

        });

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
        VALUES ($1, $2, $3)
        ON CONFLICT (endpoint)
        DO UPDATE SET id_usuario = EXCLUDED.id_usuario, subscription_json = EXCLUDED.subscription_json
        `;
      await db.query(query, [id_usuario, subscription.endpoint, JSON.stringify(subscription)]);
      res.status(201).json({ success: true, message: 'Suscripción guardada.' });
    } catch (error) {
      console.error(error);
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
    const queryInsert = `INSERT INTO reportes (id_usuario, tipo, descripcion, fecha_incidente) VALUES ($1, $2, $3, $4) 
    RETURNING id_reporte`;
    const resultadoDB = await db.query(queryInsert, [id_usuario, tipo, descripcion, fecha_incidente]);
    
    const dispositivosQuery = await db.query('SELECT id_suscripcion, subscription_json FROM suscripciones_push');
    const payload = JSON.stringify({
      title: '¡Alerta en Dprisa!',
      body: `${tipo}: ${descripcion}`,
      icon: 'https://cdn-icons-png.flaticon.com/512/1048/1048314.png',
      url: '/mapa.html'
    });

    const notificaciones = dispositivosQuery.rows.map(disp => {
      const subObjeto = JSON.parse(disp.subscription_json);
      return webpush.sendNotification(subObjeto, payload).catch(async () => {
        await db.query('DELETE FROM suscripciones_push WHERE id_suscripcion = $1', [disp.id_suscripcion]);
      });
    });
    
    await Promise.all(notificaciones);
    res.status(201).json({ success: true, message: 'Reporte guardado.', id_reporte: resultadoDB.rows[0].id_reporte });
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
    const listaReportes = await db.query(querySelect);
    res.status(200).json({ success: true, reportes: listaReportes.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error BD.' });
  }
});

// 6. ELIMINAR UN REPORTE
// 6. ELIMINAR UN REPORTE
app.delete('/api/reportes/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const resultado = await db.query(
            'DELETE FROM reportes WHERE id_reporte = $1 RETURNING id_reporte',
            [id]
        );

        if (resultado.rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'Reporte no encontrado.'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Reporte eliminado correctamente.',
            id_reporte: resultado.rows[0].id_reporte
        });

    } catch (error) {
        console.error('Error al eliminar reporte:', error);

        res.status(500).json({
            success: false,
            message: 'No se pudo eliminar el reporte.'
        });
    }
});

// ==========================================
//            INICIAR SERVIDOR
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Microservicio Dprisa ejecutándose en http://localhost:${PORT}`);
});