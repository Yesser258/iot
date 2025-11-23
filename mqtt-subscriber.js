import mqtt from 'mqtt';
import fetch from 'node-fetch';

// ==================================================================
// 1. CLOUD MQTT CONFIGURATION (HiveMQ)
// ==================================================================
// Copy these from your HiveMQ Cloud Cluster "Overview" and "Access Management"
const MQTT_HOST = 'adca8393a75d4885aa7ba6e20e4fe830.s1.eu.hivemq.cloud'; // e.g. 8f92a8.s1.eu.hivemq.cloud
const MQTT_PORT = 8883; // Secure Port (SSL)
const MQTT_USER = 'esp32_yesser'; // The username you created
const MQTT_PASS = 'esp32Fedi'; // The password you created
const MQTT_TOPIC = 'esp32/sensors';

// ==================================================================
// 2. SUPABASE CONFIGURATION
// ==================================================================
const SUPABASE_URL = 'https://mgbqamykkiwihpecnnmh.supabase.co';
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/mqtt-bridge`;
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nYnFhbXlra2l3aWhwZWNubm1oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzMjg0NzcsImV4cCI6MjA3ODkwNDQ3N30.s8l41QbkhiX8TD1OeRiRboZgA7v_S-8WLoCbLL_czoo';

console.log('🚀 Cloud MQTT Bridge Starting...');
console.log(`📡 Connecting to HiveMQ Cloud: ${MQTT_HOST}...`);

// Connect using Secure MQTT (mqtts://)
const client = mqtt.connect(`mqtts://${MQTT_HOST}:${MQTT_PORT}`, {
  username: MQTT_USER,
  password: MQTT_PASS,
  // This prevents crashes if the SSL certificate is tricky (common in testing)
  rejectUnauthorized: false 
});

client.on('connect', () => {
  console.log('✅ Connected to HiveMQ Cloud Broker');
  client.subscribe(MQTT_TOPIC, (err) => {
    if (err) {
      console.error('❌ Subscription error:', err);
    } else {
      console.log(`📬 Subscribed to topic: ${MQTT_TOPIC}`);
      console.log('⏳ Waiting for data from ESP32...\n');
    }
  });
});

client.on('message', async (topic, message) => {
  try {
    const messageString = message.toString();
    const data = JSON.parse(messageString);
    
    console.log('📥 Received from Cloud:', data);

    // Forward to Supabase Edge Function
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: messageString,
    });

    if (response.ok) {
      console.log('✅ Sent to Supabase successfully');
      console.log('-----------------------------------\n');
    } else {
      const errorText = await response.text();
      console.error('❌ Supabase Error:', response.status, errorText);
    }
  } catch (error) {
    console.error('❌ Error processing message:', error.message);
  }
});

client.on('error', (error) => {
  console.error('❌ MQTT Connection Error:', error.message);
});

client.on('close', () => {
  console.log('🔌 Disconnected from Cloud Broker');
});