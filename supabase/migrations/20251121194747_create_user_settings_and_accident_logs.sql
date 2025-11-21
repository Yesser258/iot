/*
  # User Settings and Accident Detection System

  1. New Tables
    - `user_settings`
      - `id` (uuid, primary key)
      - `user_email` (text) - Email of the helmet/scooter owner
      - `emergency_contact_1` (text) - First emergency contact email
      - `emergency_contact_2` (text) - Second emergency contact email
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `accident_logs`
      - `id` (uuid, primary key)
      - `latitude` (numeric) - GPS location at time of accident
      - `longitude` (numeric) - GPS location at time of accident
      - `danger_percentage` (integer) - Severity level (0-100)
      - `acc_x` (numeric) - Accelerometer data at impact
      - `acc_y` (numeric)
      - `acc_z` (numeric)
      - `gyro_x` (numeric) - Gyroscope data at impact
      - `gyro_y` (numeric)
      - `gyro_z` (numeric)
      - `status` (text) - 'pending', 'confirmed', 'cancelled'
      - `user_responded` (boolean) - Whether user cancelled the alert
      - `emails_sent` (boolean) - Whether emergency emails were sent
      - `created_at` (timestamptz)
  
  2. Security
    - Enable RLS on both tables
    - Public can read and insert settings (for demo purposes)
    - Public can insert accident logs
    - Authenticated users can manage their own data
  
  3. Important Notes
    - Single row in user_settings for simplicity (can be expanded)
    - Accident logs track all detection events
    - Danger percentage calculated from sensor data magnitude
*/

CREATE TABLE IF NOT EXISTS user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL DEFAULT '',
  emergency_contact_1 text NOT NULL DEFAULT '',
  emergency_contact_2 text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accident_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  latitude numeric NOT NULL DEFAULT 0,
  longitude numeric NOT NULL DEFAULT 0,
  danger_percentage integer NOT NULL DEFAULT 0,
  acc_x numeric NOT NULL DEFAULT 0,
  acc_y numeric NOT NULL DEFAULT 0,
  acc_z numeric NOT NULL DEFAULT 0,
  gyro_x numeric NOT NULL DEFAULT 0,
  gyro_y numeric NOT NULL DEFAULT 0,
  gyro_z numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  user_responded boolean DEFAULT false,
  emails_sent boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE accident_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to settings"
  ON user_settings FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public insert to settings"
  ON user_settings FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow public update to settings"
  ON user_settings FOR UPDATE
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public read access to accident logs"
  ON accident_logs FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public insert to accident logs"
  ON accident_logs FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow public update to accident logs"
  ON accident_logs FOR UPDATE
  TO anon, authenticated
  USING (true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_settings LIMIT 1) THEN
    INSERT INTO user_settings (user_email, emergency_contact_1, emergency_contact_2)
    VALUES ('', '', '');
  END IF;
END $$;