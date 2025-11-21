export interface AccidentResult {
  isAccident: boolean;
  dangerPercentage: number;
  reason: string;
}

export function detectAccident(
  accX: number,
  accY: number,
  accZ: number,
  gyroX: number,
  gyroY: number,
  gyroZ: number
): AccidentResult {
  const gForceThreshold = 3.0;
  const hardImpactThreshold = 5.0;
  const extremeImpactThreshold = 8.0;

  const rotationThreshold = 200;
  const extremeRotationThreshold = 400;

  const totalAcceleration = Math.sqrt(accX * accX + accY * accY + accZ * accZ);
  const totalRotation = Math.sqrt(gyroX * gyroX + gyroY * gyroY + gyroZ * gyroZ);

  const accelerationDelta = Math.abs(totalAcceleration - 1.0);

  let dangerScore = 0;
  let reasons: string[] = [];

  if (accelerationDelta > extremeImpactThreshold) {
    dangerScore += 70;
    reasons.push('Extreme impact detected');
  } else if (accelerationDelta > hardImpactThreshold) {
    dangerScore += 50;
    reasons.push('Hard impact detected');
  } else if (accelerationDelta > gForceThreshold) {
    dangerScore += 30;
    reasons.push('Significant impact detected');
  }

  if (totalRotation > extremeRotationThreshold) {
    dangerScore += 30;
    reasons.push('Extreme rotation detected');
  } else if (totalRotation > rotationThreshold) {
    dangerScore += 20;
    reasons.push('High rotation detected');
  }

  const combinedForce = accelerationDelta + (totalRotation / 100);
  if (combinedForce > 6.0) {
    dangerScore += 15;
    reasons.push('Combined high forces');
  }

  dangerScore = Math.min(100, dangerScore);

  const isAccident = dangerScore >= 40;

  return {
    isAccident,
    dangerPercentage: Math.round(dangerScore),
    reason: reasons.join(', ') || 'Normal operation',
  };
}

export class AccidentDetectionService {
  private recentReadings: Array<{
    acc: { x: number; y: number; z: number };
    gyro: { x: number; y: number; z: number };
    timestamp: number;
  }> = [];

  private readonly windowSize = 10;
  private readonly minReadingsForDetection = 5;

  addReading(
    accX: number,
    accY: number,
    accZ: number,
    gyroX: number,
    gyroY: number,
    gyroZ: number
  ) {
    this.recentReadings.push({
      acc: { x: accX, y: accY, z: accZ },
      gyro: { x: gyroX, y: gyroY, z: gyroZ },
      timestamp: Date.now(),
    });

    if (this.recentReadings.length > this.windowSize) {
      this.recentReadings.shift();
    }
  }

  detectWithHistory(): AccidentResult {
    if (this.recentReadings.length < this.minReadingsForDetection) {
      return {
        isAccident: false,
        dangerPercentage: 0,
        reason: 'Insufficient data',
      };
    }

    const latest = this.recentReadings[this.recentReadings.length - 1];
    const result = detectAccident(
      latest.acc.x,
      latest.acc.y,
      latest.acc.z,
      latest.gyro.x,
      latest.gyro.y,
      latest.gyro.z
    );

    if (result.isAccident) {
      const recentAccidents = this.recentReadings.slice(-3).filter((reading) => {
        const check = detectAccident(
          reading.acc.x,
          reading.acc.y,
          reading.acc.z,
          reading.gyro.x,
          reading.gyro.y,
          reading.gyro.z
        );
        return check.isAccident;
      });

      if (recentAccidents.length >= 2) {
        result.dangerPercentage = Math.min(100, result.dangerPercentage + 10);
        result.reason += ' (sustained impact)';
      }
    }

    return result;
  }

  reset() {
    this.recentReadings = [];
  }
}
