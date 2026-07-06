const express = require('express');
const webpush = require('web-push');
const cors = require('cors');

const app = express();
const db = require('./database'); // Importa la conexión a la base de datos MySQL

// Configuración de Middlewares
app.use(cors()); // Permite que tu HTML se conecte al servidor Node
app.use(express.json()); // Permite recibir datos en formato JSON

// --- CONFIGURACIÓN DE WEB-PUSH ---
// Reemplaza estas variables con las llaves que generaste
const publicVapidKey = 'BApc8sZjqEMNmgUAoZ8IRRt4v9cJItJCP2IEpoThoU1yqr9FK9Ian3i-GIW457WgWatp3Y_6SP37Fjwov2OPSog';
const privateVapidKey = 'VygJU70G5z4pAU1qr4-sYG-IJFTpluFEZuubXH54oZ0';

webpush.setVapidDetails(
  'mailto:contacto@dprisa.com', // Correo de contacto (requerido por el protocolo VAPID)
  publicVapidKey,
  privateVapidKey
);

// --- BASE DE DATOS TEMPORAL ---
// Aquí guardamos las suscripciones de los navegadores.
// En producción, esto debería guardarse en una base de datos (ej. MongoDB, MySQL).
let suscripciones = [];

// --- RUTAS DEL API ---

// 1. Ruta para guardar la suscripción de un nuevo usuario
app.post('/api/suscripciones', (req, res) => {
  const subscription = req.body;
  
  // Evitar duplicados simples comprobando el endpoint
  const existe = suscripciones.find(sub => sub.endpoint === subscription.endpoint);
  if (!existe) {
    suscripciones.push(subscription);
    console.log(`Nueva suscripción. Total de usuarios activos: ${suscripciones.length}`);
  }

  res.status(201).json({ success: true, message: 'Suscripción guardada.' });
});

// 2. Ruta para emitir una alerta a todos los usuarios
app.post('/api/reportes/nuevo', async (req, res) => {
  const { tipo, descripcion } = req.body.datos;

  console.log(`Recibido reporte de ${tipo}. Notificando a ${suscripciones.length} usuarios...`);

  // Estructura visual de la notificación
  const payload = JSON.stringify({
    title: '¡Alerta de Tráfico en Dprisa!',
    body: `${tipo}: ${descripcion}`,
    icon: 'https://cdn-icons-png.flaticon.com/512/1048/1048314.png', // Logo genérico de alerta
    url: '/mapa.html'
  });

  try {
    // Enviar notificación a todos los usuarios suscritos en paralelo
    const notificaciones = suscripciones.map((sub, index) => {
      return webpush.sendNotification(sub, payload).catch(error => {
        console.error('Error al enviar notificación a un usuario (posiblemente canceló permisos).');
        // Si falla, removemos esa suscripción del arreglo
        suscripciones.splice(index, 1); 
      });
    });

    await Promise.all(notificaciones);
    res.status(200).json({ success: true, message: 'Notificaciones enviadas con éxito.' });

  } catch (error) {
    console.error('Error crítico al enviar notificaciones:', error);
    res.status(500).json({ success: false, error: 'Fallo al procesar notificaciones.' });
  }
});

// Ruta para registrar un nuevo usuario
app.post('/api/registro', async (req, res) => {
    const { nombre, correo, contrasena } = req.body;

    try {
        const query = 'INSERT INTO usuarios (nombre, correo, contrasena) VALUES (?, ?, ?)';
        const [resultado] = await db.query(query, [nombre, correo, contrasena]);
        
        res.status(201).json({ success: true, message: 'Usuario registrado con éxito', id: resultado.insertId });
    } catch (error) {
        console.error('Error al registrar usuario:', error);
        // Si el error es por correo duplicado (código 1062 en MySQL)
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'Este correo ya está registrado.' });
        }
        res.status(500).json({ success: false, message: 'Error en el servidor.' });
    }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Microservicio Dprisa ejecutándose en http://localhost:${PORT}`);
  console.log(`Asegúrate de poner esta Llave Pública en tu mapa.html: ${publicVapidKey}`);
});