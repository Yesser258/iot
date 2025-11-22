import { useState, useEffect, useRef } from 'react';
import { Bike, Wifi, WifiOff } from 'lucide-react';
import HelmetVisualization from './components/HelmetVisualization';
import LocationCard from './components/LocationCard';
import SensorDataCard from './components/SensorDataCard';
import SettingsPanel from './components/SettingsPanel';
import AccidentAlert from './components/AccidentAlert';
import { getSimulatedData, type SensorData } from './data/staticData';
import { getLatestSensorData, subscribeSensorData, type SensorDataRow, supabase } from './lib/supabase';
import { AccidentDetectionService } from './lib/accidentDetection';

// Helper: Calcule les angles d'inclinaison (Pitch/Roll) à partir de la gravité (Accéléromètre)
// RETOURNE DES DEGRÉS (Essentiel pour que la visualisation 3D fonctionne correctement)
function calculateOrientation(acc: { x: number; y: number; z: number }) {
  const pitchRad = Math.atan2(acc.y, acc.z);
  // Note: On inverse X pour le Roll pour correspondre aux mouvements standards
  const rollRad = Math.atan2(-acc.x, Math.sqrt(acc.y * acc.y + acc.z * acc.z));
  
  const toDeg = (rad: number) => rad * (180 / Math.PI);
  
  return { 
    x: toDeg(pitchRad), 
    y: 0, // Le lacet (Yaw/Z) n'est pas calculable avec l'accéléromètre seul
    z: toDeg(rollRad) 
  };
}

// Helper: Filtre Passe-Bas pour lisser les données (réduit le tremblement des chiffres et du modèle 3D)
function lowPassFilter(current: number, previous: number, alpha: number = 0.1) {
  return previous + alpha * (current - previous);
}

function convertToSensorData(row: SensorDataRow): SensorData {
  return {
    location: { latitude: row.latitude, longitude: row.longitude },
    accelerometer: { x: row.acc_x / 16384.0, y: row.acc_y / 16384.0, z: row.acc_z / 16384.0 },
    gyroscope: { x: row.gyro_x / 131.0, y: row.gyro_y / 131.0, z: row.gyro_z / 131.0 },
    timestamp: row.created_at,
  };
}

function App() {
  const [sensorData, setSensorData] = useState<SensorData>(getSimulatedData());
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [activeAccident, setActiveAccident] = useState<{ id: string; dangerPercentage: number } | null>(null);

  const detectionService = useRef(new AccidentDetectionService());
  const accidentTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Référence pour le lissage des données (stocke l'état précédent)
  const prevAccel = useRef({ x: 0, y: 0, z: 1 });

  // --- VERROU : Empêche l'envoi de multiples messages pour le même accident ---
  const isTriggered = useRef(false); 

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    const handleNewData = (newData: SensorDataRow) => {
      const raw = convertToSensorData(newData);
      
      // 1. Logique de lissage (Smoothing)
      const smoothAlpha = 0.1; 
      const smoothedAccel = {
        x: lowPassFilter(raw.accelerometer.x, prevAccel.current.x, smoothAlpha),
        y: lowPassFilter(raw.accelerometer.y, prevAccel.current.y, smoothAlpha),
        z: lowPassFilter(raw.accelerometer.z, prevAccel.current.z, smoothAlpha),
      };
      prevAccel.current = smoothedAccel;

      // On utilise les données lissées pour l'affichage et la détection d'orientation
      const finalData: SensorData = { ...raw, accelerometer: smoothedAccel };

      setSensorData(finalData);
      setIsConnected(true);
      setLastUpdate(new Date(newData.created_at));

      // 2. Logique de détection d'accident (Impact)
      detectionService.current.addReading(
        finalData.accelerometer.x, finalData.accelerometer.y, finalData.accelerometer.z,
        finalData.gyroscope.x, finalData.gyroscope.y, finalData.gyroscope.z
      );

      const result = detectionService.current.detectWithHistory();
      
      // 3. Détection de retournement (Upside Down)
      // Si Z est négatif, le casque est à l'envers.
      const zValue = finalData.accelerometer.z;
      const isUpsideDown = zValue < 0.0; 

      // --- DÉCLENCHEMENT ---
      // On vérifie le verrou (isTriggered) pour ne pas spammer
      if ((result.isAccident || isUpsideDown) && !activeAccident && !isTriggered.current) {
        console.log('ACCIDENT DÉCLENCHÉ (Impact ou Retournement)');
        
        // Verrouillage immédiat
        isTriggered.current = true;

        // Si retourné, danger maximal
        const finalDanger = isUpsideDown ? 100 : result.dangerPercentage;

        handleAccidentDetected(
          finalData.location.latitude, finalData.location.longitude, finalDanger,
          newData.acc_x, newData.acc_y, newData.acc_z,
          newData.gyro_x, newData.gyro_y, newData.gyro_z
        );
      }
    };

    const initializeData = async () => {
      const latestData = await getLatestSensorData();
      if (latestData) handleNewData(latestData);
      unsubscribe = subscribeSensorData(async (newData) => handleNewData(newData));
    };

    initializeData();

    const checkTimeout = setInterval(() => {
      if (lastUpdate && Date.now() - lastUpdate.getTime() > 5000) setIsConnected(false);
    }, 1000);

    return () => {
      if (unsubscribe) unsubscribe();
      clearInterval(checkTimeout);
    };
  }, [lastUpdate, activeAccident]);

  const handleAccidentDetected = async (
    latitude: number, longitude: number, dangerPercentage: number,
    accX: number, accY: number, accZ: number,
    gyroX: number, gyroY: number, gyroZ: number
  ) => {
    try {
      const { data: accidentLog, error: logError } = await supabase
        .from('accident_logs')
        .insert({
          latitude, longitude, danger_percentage: dangerPercentage,
          acc_x: accX, acc_y: accY, acc_z: accZ,
          gyro_x: gyroX, gyro_y: gyroY, gyro_z: gyroZ,
          status: 'pending', user_responded: false, emails_sent: false,
        })
        .select().single();

      if (logError || !accidentLog) return;

      setActiveAccident({ id: accidentLog.id, dangerPercentage });

      const { data: settings } = await supabase.from('user_settings').select('*').limit(1).maybeSingle();

      // --- CORRECTION : Envoi Telegram même si l'email est vide ---
      if (settings) {
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-accident-alert`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            // On envoie des valeurs par défaut si les champs sont vides pour éviter les erreurs
            userEmail: settings.user_email || "telegram-user", 
            contact1: settings.emergency_contact_1 || "telegram-group",
            contact2: settings.emergency_contact_2 || "",
            latitude, longitude, dangerPercentage,
            accidentId: accidentLog.id,
            emailType: 'user_confirmation',
          }),
        });
      }

      accidentTimeoutRef.current = setTimeout(async () => {
        await sendEmergencyAlerts(accidentLog.id, settings, latitude, longitude, dangerPercentage);
      }, 30000);
    } catch (error) {
      console.error('Erreur gestion accident:', error);
    }
  };

  const sendEmergencyAlerts = async (accidentId: string, settings: any, latitude: number, longitude: number, dangerPercentage: number) => {
    // --- CORRECTION : Envoi Telegram au groupe même sans email contact ---
    if (settings) {
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-accident-alert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          userEmail: settings.user_email || "telegram-user",
          contact1: settings.emergency_contact_1 || "telegram-group",
          contact2: settings.emergency_contact_2 || "",
          latitude, longitude, dangerPercentage,
          accidentId,
          emailType: 'emergency_alert',
        }),
      });
      await supabase.from('accident_logs').update({ status: 'confirmed', emails_sent: true }).eq('id', accidentId);
    }
    setActiveAccident(null);
    
    // Déverrouillage du système après envoi
    setTimeout(() => { isTriggered.current = false; }, 5000);
  };

  const handleCancelAccident = async () => {
    if (activeAccident && accidentTimeoutRef.current) {
      clearTimeout(accidentTimeoutRef.current);
      accidentTimeoutRef.current = null;
      await supabase.from('accident_logs').update({ status: 'cancelled', user_responded: true }).eq('id', activeAccident.id);
      setActiveAccident(null);
      detectionService.current.reset();

      console.log("Alerte annulée.");
      // Délai avant de réarmer le système (5 secondes)
      setTimeout(() => { isTriggered.current = false; }, 5000);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-200 relative">
      <SettingsPanel />
      {activeAccident && (
        <AccidentAlert
          accidentId={activeAccident.id}
          dangerPercentage={activeAccident.dangerPercentage}
          onCancel={handleCancelAccident}
        />
      )}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Bike className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Motorcycle Helmet IoT Dashboard</h1>
                <p className="text-sm text-gray-600">Real-time monitoring system</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isConnected ? (
                <>
                  <Wifi className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-medium text-green-600">Live</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-5 h-5 text-red-600" />
                  <span className="text-sm font-medium text-red-600">Disconnected</span>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-140px)]">
          <LocationCard latitude={sensorData.location.latitude} longitude={sensorData.location.longitude} />
          <SensorDataCard
            rotation={sensorData.gyroscope}
            // On passe les données lissées pour l'affichage
            acceleration={sensorData.accelerometer}
            timestamp={sensorData.timestamp}
          />
          <div className="bg-white rounded-lg shadow-lg p-4 flex flex-col">
            <h2 className="text-xl font-semibold text-gray-800 mb-3">3D Helmet Orientation</h2>
            <div className="flex-1 w-full">
              {/* IMPORTANT : On passe l'orientation calculée en degrés */}
              <HelmetVisualization rotation={calculateOrientation(sensorData.accelerometer)} />
            </div>
            <div className="mt-3 text-xs text-gray-600 text-center">Use mouse to rotate • Scroll to zoom</div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;