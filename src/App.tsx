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

// This function now converts accelerometer data as well
function convertToSensorData(row: SensorDataRow): SensorData {
  return {
    location: {
      latitude: row.latitude,
      longitude: row.longitude,
    },
    // --- THIS IS THE NEW PART ---
    accelerometer: {
      x: row.acc_x / 16384.0, // Converts raw data to g-force
      y: row.acc_y / 16384.0,
      z: row.acc_z / 16384.0,
    },
    // --- END NEW PART ---
    gyroscope: {
      x: row.gyro_x / 131.0, // Converts raw data to degrees/sec
      y: row.gyro_y / 131.0,
      z: row.gyro_z / 131.0,
    },
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

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    const initializeData = async () => {
      const latestData = await getLatestSensorData();
      if (latestData) {
        setSensorData(convertToSensorData(latestData));
        setIsConnected(true);
        setLastUpdate(new Date(latestData.created_at));
      }

      unsubscribe = subscribeSensorData(async (newData) => {
        const converted = convertToSensorData(newData);
        setSensorData(converted);
        setIsConnected(true);
        setLastUpdate(new Date(newData.created_at));

        detectionService.current.addReading(
          converted.accelerometer.x,
          converted.accelerometer.y,
          converted.accelerometer.z,
          converted.gyroscope.x,
          converted.gyroscope.y,
          converted.gyroscope.z
        );

        const result = detectionService.current.detectWithHistory();

        if (result.isAccident && !activeAccident) {
          console.log('Accident detected!', result);
          await handleAccidentDetected(
            converted.location.latitude,
            converted.location.longitude,
            result.dangerPercentage,
            newData.acc_x,
            newData.acc_y,
            newData.acc_z,
            newData.gyro_x,
            newData.gyro_y,
            newData.gyro_z
          );
        }
      });
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
    latitude: number,
    longitude: number,
    dangerPercentage: number,
    accX: number,
    accY: number,
    accZ: number,
    gyroX: number,
    gyroY: number,
    gyroZ: number
  ) => {
    try {
      const { data: accidentLog, error: logError } = await supabase
        .from('accident_logs')
        .insert({
          latitude,
          longitude,
          danger_percentage: dangerPercentage,
          acc_x: accX,
          acc_y: accY,
          acc_z: accZ,
          gyro_x: gyroX,
          gyro_y: gyroY,
          gyro_z: gyroZ,
          status: 'pending',
          user_responded: false,
          emails_sent: false,
        })
        .select()
        .single();

      if (logError || !accidentLog) {
        console.error('Error logging accident:', logError);
        return;
      }

      setActiveAccident({
        id: accidentLog.id,
        dangerPercentage,
      });

      const { data: settings } = await supabase
        .from('user_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (settings?.user_email) {
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-accident-alert`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            userEmail: settings.user_email,
            contact1: settings.emergency_contact_1,
            contact2: settings.emergency_contact_2,
            latitude,
            longitude,
            dangerPercentage,
            accidentId: accidentLog.id,
            emailType: 'user_confirmation',
          }),
        });
      }

      accidentTimeoutRef.current = setTimeout(async () => {
        await sendEmergencyAlerts(accidentLog.id, settings, latitude, longitude, dangerPercentage);
      }, 30000);
    } catch (error) {
      console.error('Error handling accident:', error);
    }
  };

  const sendEmergencyAlerts = async (
    accidentId: string,
    settings: any,
    latitude: number,
    longitude: number,
    dangerPercentage: number
  ) => {
    if (settings && (settings.emergency_contact_1 || settings.emergency_contact_2)) {
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-accident-alert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          userEmail: settings.user_email,
          contact1: settings.emergency_contact_1,
          contact2: settings.emergency_contact_2,
          latitude,
          longitude,
          dangerPercentage,
          accidentId,
          emailType: 'emergency_alert',
        }),
      });

      await supabase
        .from('accident_logs')
        .update({
          status: 'confirmed',
          emails_sent: true,
        })
        .eq('id', accidentId);
    }

    setActiveAccident(null);
  };

  const handleCancelAccident = async () => {
    if (activeAccident && accidentTimeoutRef.current) {
      clearTimeout(accidentTimeoutRef.current);
      accidentTimeoutRef.current = null;

      await supabase
        .from('accident_logs')
        .update({
          status: 'cancelled',
          user_responded: true,
        })
        .eq('id', activeAccident.id);

      setActiveAccident(null);
      detectionService.current.reset();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-200">
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
          <LocationCard
            latitude={sensorData.location.latitude}
            longitude={sensorData.location.longitude}
          />
          <SensorDataCard
            rotation={sensorData.gyroscope}
            acceleration={sensorData.accelerometer} // <-- THIS PROP IS NOW ADDED
            timestamp={sensorData.timestamp}
          />

          <div className="bg-white rounded-lg shadow-lg p-4 flex flex-col">
            <h2 className="text-xl font-semibold text-gray-800 mb-3">3D Helmet Orientation</h2>
            <div className="flex-1 w-full">
              <HelmetVisualization rotation={sensorData.gyroscope} />
            </div>
            <div className="mt-3 text-xs text-gray-600 text-center">
              Use mouse to rotate • Scroll to zoom
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;