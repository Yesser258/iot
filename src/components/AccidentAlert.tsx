import { useState, useEffect } from 'react';
import { AlertTriangle, X, Clock } from 'lucide-react';

interface AccidentAlertProps {
  accidentId: string;
  dangerPercentage: number;
  onCancel: () => void;
}

export default function AccidentAlert({ accidentId, dangerPercentage, onCancel }: AccidentAlertProps) {
  const [countdown, setCountdown] = useState(30);

  useEffect(() => {
    if (countdown <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown]);

  const getDangerColor = () => {
    if (dangerPercentage >= 80) return 'bg-red-600';
    if (dangerPercentage >= 60) return 'bg-orange-600';
    return 'bg-yellow-600';
  };

  const getDangerText = () => {
    if (dangerPercentage >= 80) return 'CRITICAL';
    if (dangerPercentage >= 60) return 'HIGH';
    return 'MODERATE';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4 animate-pulse-slow">
      <div className="bg-white rounded-lg shadow-2xl max-w-md w-full overflow-hidden border-4 border-red-600">
        <div className={`${getDangerColor()} p-4 text-white`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-8 h-8 animate-bounce" />
              <div>
                <h2 className="text-2xl font-bold">ACCIDENT DETECTED</h2>
                <p className="text-sm opacity-90">{getDangerText()} DANGER LEVEL</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-gray-100 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Danger Level</span>
              <span className="text-3xl font-bold text-red-600">{dangerPercentage}%</span>
            </div>
            <div className="w-full bg-gray-300 rounded-full h-3 overflow-hidden">
              <div
                className={`h-full ${getDangerColor()} transition-all duration-500`}
                style={{ width: `${dangerPercentage}%` }}
              />
            </div>
          </div>

          <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <Clock className="w-6 h-6 text-yellow-700" />
              <div>
                <p className="font-bold text-yellow-900 text-lg">Time Remaining</p>
                <p className="text-sm text-yellow-800">Emergency contacts will be notified</p>
              </div>
            </div>
            <div className="text-center">
              <div className="text-6xl font-bold text-yellow-900 tabular-nums">
                {countdown}
              </div>
              <p className="text-sm text-yellow-800 mt-1">seconds</p>
            </div>
          </div>

          <div className="space-y-2">
            <button
              onClick={onCancel}
              disabled={countdown === 0}
              className="w-full py-4 bg-green-600 text-white rounded-lg font-bold text-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              <X className="w-6 h-6" />
              {countdown === 0 ? 'Alert Sent' : "I'M OK - CANCEL ALERT"}
            </button>
            <p className="text-xs text-center text-gray-600">
              Click to cancel emergency notifications
            </p>
          </div>

          <div className="text-xs text-gray-500 text-center pt-2 border-t border-gray-200">
            Accident ID: {accidentId.slice(0, 8)}
          </div>
        </div>
      </div>
    </div>
  );
}
