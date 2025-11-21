import { Activity } from 'lucide-react';

interface SensorDataCardProps {
  rotation: { x: number; y: number; z: number };
  acceleration: { x: number; y: number; z: number };
  timestamp: string;
}

export default function SensorDataCard({ rotation, acceleration, timestamp }: SensorDataCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-3 bg-green-100 rounded-lg">
          <Activity className="w-6 h-6 text-green-600" />
        </div>
        <h2 className="text-xl font-semibold text-gray-800">MPU9250 Gyroscope</h2>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
          <span className="text-gray-600 font-medium">X-Axis (Roll):</span>
          <span className="text-gray-900 font-mono text-lg">{rotation.x.toFixed(2)}°</span>
        </div>

        <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
          <span className="text-gray-600 font-medium">Y-Axis (Pitch):</span>
          <span className="text-gray-900 font-mono text-lg">{rotation.y.toFixed(2)}°</span>
        </div>

        <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
          <span className="text-gray-600 font-medium">Z-Axis (Yaw):</span>
          <span className="text-gray-900 font-mono text-lg">{rotation.z.toFixed(2)}°</span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">System Status</h3>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-gray-600 text-sm">Connection:</span>
            <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">Online</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600 text-sm">Battery:</span>
            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">85%</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600 text-sm">Last Update:</span>
            <span className="text-gray-900 text-xs font-mono">{new Date(timestamp).toLocaleTimeString()}</span>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-xs text-gray-600">Sensor Active</span>
          </div>
        </div>
      </div>
    </div>
  );
}
