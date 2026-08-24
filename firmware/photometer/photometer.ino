/*
 * Tabletop transit photometer
 * ---------------------------
 * Streams illuminance from a BH1750 ambient light sensor at 10 Hz as one JSON
 * object per line, which the dashboard reads over the Web Serial API:
 *
 *     {"t":1043,"lux":118.25,"seq":104}
 *
 * Wiring (Arduino Uno / Nano)      Wiring (ESP32)
 *   BH1750 VCC -> 5V (or 3V3)        BH1750 VCC -> 3V3
 *   BH1750 GND -> GND                BH1750 GND -> GND
 *   BH1750 SDA -> A4                 BH1750 SDA -> GPIO21
 *   BH1750 SCL -> A5                 BH1750 SCL -> GPIO22
 *   BH1750 ADDR-> GND (0x23)         BH1750 ADDR-> GND (0x23)
 *
 * Dependencies: "BH1750" by Christopher Laws (Library Manager).
 *
 * The sensor is read in continuous high-resolution mode. At 10 Hz the BH1750's
 * 120 ms integration time is the limiting factor, so each sample is not fully
 * independent; that is the hardware analogue of Kepler's 30 minute cadence
 * smearing the ingress of a transit.
 */

#include <Wire.h>
#include <BH1750.h>

static const uint32_t kBaudRate = 9600;
static const uint32_t kSampleIntervalMs = 100;  // 10 Hz
static const uint8_t kAddress = 0x23;

BH1750 lightMeter(kAddress);

uint32_t nextSampleMs = 0;
uint32_t sequence = 0;
bool sensorReady = false;

void setup() {
  Serial.begin(kBaudRate);
  while (!Serial && millis() < 3000) {
    // Wait for the USB CDC port on boards that need it, but never hang.
  }

  Wire.begin();
  sensorReady = lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE);

  if (!sensorReady) {
    Serial.println(F("{\"error\":\"BH1750 not found on I2C\"}"));
  } else {
    Serial.println(F("{\"ready\":true,\"hz\":10,\"sensor\":\"BH1750\"}"));
  }

  nextSampleMs = millis();
}

void loop() {
  if (!sensorReady) {
    // Retry rather than spin silently: a loose I2C wire is the usual cause.
    delay(1000);
    sensorReady = lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE);
    return;
  }

  const uint32_t now = millis();
  if ((int32_t)(now - nextSampleMs) < 0) {
    return;
  }
  nextSampleMs += kSampleIntervalMs;

  const float lux = lightMeter.readLightLevel();
  if (lux < 0.0f) {
    Serial.println(F("{\"error\":\"read failed\"}"));
    return;
  }

  // Fixed field order and two decimals keep the line short enough that the
  // serial buffer never becomes the bottleneck at 10 Hz.
  Serial.print(F("{\"t\":"));
  Serial.print(now);
  Serial.print(F(",\"lux\":"));
  Serial.print(lux, 2);
  Serial.print(F(",\"seq\":"));
  Serial.print(sequence++);
  Serial.println(F("}"));
}
