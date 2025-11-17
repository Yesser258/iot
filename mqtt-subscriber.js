import mqtt from 'mqtt';
import https from 'https';

const MQTT_BROKER = 'mqtt://192.168.1.149:1883';
const MQTT_TOPIC = 'esp32/sensors';


const SUPABASE_URL = 'https://mgbqamykkiwihpecnnmh.supabase.co';
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/mqtt-bridge`;
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nYnFhbXlra2l3aWhwZWNubm1oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzMjg0NzcsImV4cCI6MjA3ODkwNDQ3N30.s8l41QbkhiX8TD1OeRiRboZgA7v_S-8WLoCbLL_czoo';

console.log('🚀 MQTT to Supabase Bridge Starting...');
console.log('📡 Connecting to MQTT broker:', MQTT_BROKER);

const client = mqtt.connect(MQTT_BROKER);

client.on('connect', () => {
  console.log('✅ Connected to MQTT broker');
  client.subscribe(MQTT_TOPIC, (err) => {
    if (err) {
      console.error('❌ Subscription error:', err);
    } else {
      console.log('📬 Subscribed to topic:', MQTT_TOPIC);
      console.log('⏳ Waiting for ESP32 data...\n');
    }
  });
});

client.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    console.log('📥 Received from ESP32:', data);

    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (response.ok) {
      console.log('✅ Sent to Supabase successfully');
      console.log('-----------------------------------\n');
    } else {
      console.error('❌ Error sending to Supabase:', result);
    }
  } catch (error) {
    console.error('❌ Error processing message:', error.message);
  }
});

client.on('error', (error) => {
  console.error('❌ MQTT Error:', error);
});

client.on('close', () => {
  console.log('🔌 Disconnected from MQTT broker');
});

console.log('\n📋 Instructions:');
console.log('   1. Make sure your MQTT broker is running on 192.168.1.149:1883');
console.log('   2. Power on your ESP32 with the sensor code');
console.log('   3. Data will flow: ESP32 → MQTT → Supabase → Dashboard\n');
