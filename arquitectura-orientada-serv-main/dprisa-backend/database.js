const mysql = require('mysql2');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',           // Tu usuario de MySQL (usualmente root)
    password: 'Shirobutaku2', // Pon la contraseña de tu conexión local
    database: 'deprisa_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool.promise();