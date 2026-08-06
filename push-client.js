function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) { outputArray[i] = rawData.charCodeAt(i); }
    return outputArray;
}

async function inicializarNotificacionesPush() {
    let usuarioActivo = JSON.parse(localStorage.getItem("usuarioActivo"));
    if (!usuarioActivo || !usuarioActivo.id_usuario) {
        return; // Sin sesión, no registramos notificaciones
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn("⚠️ Este navegador no soporta Web Push Notifications.");
        return;
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.warn("⚠️ Permiso denegado.");
            return;
        }

        const registration = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        
        // Tu llave VAPID pública
        const llavePublicaVapid = 'BGZ1uu4Hk7k8EtsaEgC_3cM481-R-teUI01Qo2b_5fAPniG8QI_o7x8ddRFmUpevYYb1n3PxGRxfFVTmibO1sS4'; 
        const applicationServerKey = urlBase64ToUint8Array(llavePublicaVapid);

        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey
        });

        // Hacemos el fetch con la ruta relativa
        const respuesta = await fetch('/api/suscripciones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                subscription: subscription, 
                id_usuario: usuarioActivo.id_usuario 
            })
        });

        if (respuesta.ok) {
            console.log("✅ Suscripción push guardada en la base de datos.");
        }
    } catch (error) {
        console.error("❌ Error en el registro Push:", error);
    }
}