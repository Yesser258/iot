import { useState, useEffect, useRef } from 'react';
import { Wifi, WifiOff, AlertOctagon, Zap } from 'lucide-react';
import HelmetVisualization from './components/HelmetVisualization';
import LocationCard from './components/LocationCard';
import SensorDataCard from './components/SensorDataCard';
import AccidentAlert from './components/AccidentAlert';
import { getSimulatedData, type SensorData } from './data/staticData';
import { getLatestSensorData, subscribeSensorData, type SensorDataRow, supabase } from './lib/supabase';
import { AccidentDetectionService } from './lib/accidentDetection';

// Helper: Calcule les angles d'inclinaison (Pitch/Roll) à partir de la gravité (Accéléromètre)
function calculateOrientation(acc: { x: number; y: number; z: number }) {
  const pitchRad = Math.atan2(acc.y, acc.z);
  const rollRad = Math.atan2(-acc.x, Math.sqrt(acc.y * acc.y + acc.z * acc.z));
  const toDeg = (rad: number) => rad * (180 / Math.PI);
  return { x: toDeg(pitchRad), y: 0, z: toDeg(rollRad) };
}

// Helper: Filtre Passe-Bas pour lisser les données
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
  const prevAccel = useRef({ x: 0, y: 0, z: 1 });
  const isTriggered = useRef(false); 

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    const handleNewData = (newData: SensorDataRow) => {
      const raw = convertToSensorData(newData);
      
      const smoothAlpha = 0.1; 
      const smoothedAccel = {
        x: lowPassFilter(raw.accelerometer.x, prevAccel.current.x, smoothAlpha),
        y: lowPassFilter(raw.accelerometer.y, prevAccel.current.y, smoothAlpha),
        z: lowPassFilter(raw.accelerometer.z, prevAccel.current.z, smoothAlpha),
      };
      prevAccel.current = smoothedAccel;

      const finalData: SensorData = { ...raw, accelerometer: smoothedAccel };

      setSensorData(finalData);
      setIsConnected(true);
      setLastUpdate(new Date(newData.created_at));

      // Alimentation du service de détection
      detectionService.current.addReading(
        finalData.accelerometer.x, finalData.accelerometer.y, finalData.accelerometer.z,
        finalData.gyroscope.x, finalData.gyroscope.y, finalData.gyroscope.z
      );

      const result = detectionService.current.detectWithHistory();
      const zValue = finalData.accelerometer.z;

      // --- LOGIQUE D'ACCIDENT SCOOTER ---
      const isUpsideDown = zValue < -0.5;
      const isTippedOver = Math.abs(zValue) < 0.4; 

      if ((result.isAccident || isUpsideDown || isTippedOver) && !activeAccident && !isTriggered.current) {
        console.log('ACCIDENT DÉTECTÉ (Impact, Retournement ou Chute)');
        isTriggered.current = true;
        
        let finalDanger = result.dangerPercentage;
        if (isUpsideDown) finalDanger = 100; 
        else if (isTippedOver) finalDanger = Math.max(finalDanger, 80); 

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
      if (lastUpdate && Date.now() - lastUpdate.getTime() > 5000) {
        setIsConnected(false);
      }
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

      // Envoi Telegram (même sans email)
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
    setTimeout(() => { isTriggered.current = false; }, 5000);
  };

  const handleCancelAccident = async () => {
    if (activeAccident && accidentTimeoutRef.current) {
      clearTimeout(accidentTimeoutRef.current);
      accidentTimeoutRef.current = null;
      await supabase.from('accident_logs').update({ status: 'cancelled', user_responded: true }).eq('id', activeAccident.id);
      setActiveAccident(null);
      detectionService.current.reset();
      setTimeout(() => { isTriggered.current = false; }, 5000);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-200 relative">
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
              <div className="p-2 bg-indigo-600 rounded-lg">
                <Zap className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Scooter Guardian</h1>
                <p className="text-sm text-gray-600">Système de Sécurité & Tracking</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isConnected ? (
                <>
                  <Wifi className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-medium text-green-600 hidden sm:inline">Connecté</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-5 h-5 text-red-600" />
                  <span className="text-sm font-medium text-red-600 hidden sm:inline">Hors ligne</span>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* BANNIÈRE D'AVERTISSEMENT HORS LIGNE */}
      {!isConnected && (
        <div className="bg-red-500 text-white text-center py-2 font-bold animate-pulse shadow-md">
          <div className="flex items-center justify-center gap-2">
            <AlertOctagon className="w-5 h-5" />
            <span>CONNEXION PERDUE : Le scooter ne transmet plus de données ! Vérifiez l'alimentation.</span>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-140px)]">
          <LocationCard latitude={sensorData.location.latitude} longitude={sensorData.location.longitude} />
          <SensorDataCard
            rotation={sensorData.gyroscope}
            acceleration={sensorData.accelerometer}
            timestamp={sensorData.timestamp}
          />
          <div className="bg-white rounded-lg shadow-lg p-4 flex flex-col">
            <h2 className="text-xl font-semibold text-gray-800 mb-3">Orientation Scooter (Direct)</h2>
            <div className="flex-1 w-full">
              <HelmetVisualization rotation={calculateOrientation(sensorData.accelerometer)} />
            </div>
            <div className="mt-3 text-xs text-gray-600 text-center">Visualisation temps réel</div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;