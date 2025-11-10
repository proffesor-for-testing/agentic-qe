---
name: mobile-testing
description: Comprehensive mobile testing for iOS and Android platforms including gestures, sensors, permissions, device fragmentation, and performance. Use when testing native apps, hybrid apps, or mobile web, ensuring quality across 1000+ device variants.
---

# Mobile Testing

## Core Principle

**60%+ of web traffic is mobile. Testing only desktop = ignoring majority of users.**

Mobile devices have unique challenges: device fragmentation (1000+ Android devices), platform differences (iOS vs Android), touch gestures, sensors, intermittent networks, and limited resources. Mobile testing ensures quality across this complex landscape.

## What is Mobile Testing?

**Mobile Testing:** Validating functionality, usability, performance, and security of applications on mobile devices (smartphones, tablets) across multiple platforms, OS versions, and screen sizes.

**Why Critical:**
- 60%+ of global web traffic from mobile
- 1000+ Android device variants (fragmentation)
- Platform-specific behaviors (iOS ≠ Android)
- Mobile-specific interactions (gestures, sensors, permissions)
- Performance critical (slow networks, limited CPU/memory)
- App store review requirements

**Goal:** Flawless mobile experience across devices, platforms, and conditions.

## Mobile App Types

### 1. Native Apps

**iOS:** Swift/Objective-C, runs only on iOS
**Android:** Kotlin/Java, runs only on Android

**Characteristics:**
- Best performance
- Full access to device features
- Platform-specific UI (UIKit vs Material Design)
- Separate codebase per platform

**Testing Tools:**
- **iOS:** XCTest, XCUITest, EarlGrey
- **Android:** Espresso, UI Automator, Robolectric

---

### 2. Hybrid Apps

**Technologies:** React Native, Flutter, Ionic, Cordova

**Characteristics:**
- Single codebase for both platforms
- JavaScript/Dart + native bridges
- Good performance (near-native)
- Shared business logic, platform-specific UI

**Testing Tools:**
- Appium (cross-platform)
- Detox (React Native)
- Flutter Driver (Flutter)

---

### 3. Mobile Web

**PWAs, responsive websites in mobile browsers**

**Characteristics:**
- No app store submission
- Universal access via URL
- Limited device feature access
- Responsive design critical

**Testing Tools:**
- Playwright Mobile
- BrowserStack, Sauce Labs
- Chrome DevTools (mobile emulation)

---

## iOS vs Android Differences

### Key Differences

| Aspect | iOS | Android |
|--------|-----|---------|
| **OS Versions** | 2-3 supported (high adoption) | 10+ in use (fragmentation) |
| **Devices** | ~40 iPhone/iPad models | 1000+ manufacturers |
| **Screen Sizes** | Predictable set | Vast variety |
| **UI Guidelines** | Human Interface Guidelines | Material Design |
| **Permissions** | Single prompt system | Granular runtime permissions |
| **Back Button** | Swipe/nav button | Hardware/software back button |
| **App Distribution** | App Store (strict review) | Google Play + sideloading |
| **Testing Tools** | XCUITest (native) | Espresso (native) |

---

## Mobile-Specific Testing

### 1. Touch Gestures

**Gesture Types:**
```
Tap         → Single touch
Double Tap  → Quick two taps
Long Press  → Touch and hold (context menu)
Swipe       → Slide finger (scroll, swipe between screens)
Pinch       → Two fingers move apart (zoom in)
Zoom Out    → Two fingers move together (zoom out)
Rotate      → Two fingers rotate
Multi-Touch → Multiple simultaneous touches
```

**Testing with Appium:**
```javascript
// Tap
await driver.touchAction({
  action: 'tap',
  x: 100,
  y: 200
});

// Swipe (scroll down)
await driver.touchAction([
  { action: 'press', x: 200, y: 400 },
  { action: 'moveTo', x: 200, y: 100 },
  { action: 'release' }
]);

// Pinch to zoom
const finger1 = [
  { action: 'press', x: 100, y: 200 },
  { action: 'moveTo', x: 50, y: 150 },
  { action: 'release' }
];
const finger2 = [
  { action: 'press', x: 200, y: 200 },
  { action: 'moveTo', x: 250, y: 250 },
  { action: 'release' }
];
await driver.multiTouchAction([finger1, finger2]);

// Long press
await driver.touchAction({
  action: 'longPress',
  x: 100,
  y: 200,
  duration: 2000 // 2 seconds
});
```

---

### 2. Sensors Testing

**Device Sensors:**
- **GPS/Location:** Location services
- **Camera:** Photo/video capture
- **Microphone:** Audio recording
- **Accelerometer:** Device tilt/shake
- **Gyroscope:** Rotation detection
- **Proximity:** Screen off when near face
- **Ambient Light:** Brightness auto-adjust

**Testing Location:**
```javascript
// Set GPS location
await driver.setGeoLocation({
  latitude: 37.7749,
  longitude: -122.4194,
  altitude: 0
});

// Test location-based feature
const nearbyStores = await findElement('stores-list');
expect(nearbyStores.getText()).toContain('San Francisco');
```

**Testing Camera/Gallery:**
```javascript
// iOS: Push image to simulator
await driver.pushFile('/path/on/device/image.jpg', imageBase64);

// Android: Set location for gallery
await driver.execute('mobile: shell', {
  command: 'am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///path'
});

// Trigger camera/gallery picker
await driver.findElement('upload-photo-button').click();

// Verify image uploaded
expect(await driver.findElement('uploaded-image')).toBeDefined();
```

---

### 3. Permissions Testing

**iOS Permissions Flow:**
```javascript
// Request permission (iOS shows system alert)
await driver.findElement('enable-location').click();

// Handle iOS permission alert
const alert = await driver.getAlert();
expect(alert.getText()).toContain('allow location');
await alert.accept(); // or alert.dismiss()

// Verify permission granted
const locationEnabled = await driver.findElement('location-status');
expect(locationEnabled.getText()).toBe('Enabled');
```

**Android Runtime Permissions:**
```javascript
// Grant permission before test (Android)
await driver.execute('mobile: shell', {
  command: 'pm grant com.example.app android.permission.CAMERA'
});

// Or handle permission dialog during test
await driver.findElement('take-photo').click();

// Wait for permission dialog
const permissionDialog = await driver.waitForElement('com.android.packageinstaller:id/permission_message');
await driver.findElement('com.android.packageinstaller:id/permission_allow_button').click();
```

---

### 4. Network Conditions

**Test on Poor Networks:**
```javascript
// Simulate 3G network
await driver.setNetworkConnection(4); // 3G

// Test app behavior
await driver.findElement('load-content').click();

const loadingIndicator = await driver.waitForElement('spinner', 5000);
expect(loadingIndicator).toBeDefined();

// Restore full network
await driver.setNetworkConnection(6); // WiFi + Data
```

**Offline Mode Testing:**
```javascript
// Disable network
await driver.toggleAirplaneMode();

// Test offline functionality
await driver.findElement('view-saved-items').click();
const items = await driver.findElements('saved-item');
expect(items.length).toBeGreaterThan(0);

// Verify offline banner
const banner = await driver.findElement('offline-banner');
expect(banner.getText()).toContain('No internet connection');

// Re-enable network
await driver.toggleAirplaneMode();
```

---

## Device Fragmentation Strategy

### Real Devices vs Emulators

**Emulators/Simulators:**
- **Pros:** Fast, free, easy to automate, unlimited devices
- **Cons:** Not 100% accurate, no real sensors, different performance

**Real Devices:**
- **Pros:** Accurate, real sensors, actual performance, real network
- **Cons:** Expensive, harder to maintain, slower

**Strategy:** Use emulators for fast feedback, real devices for critical paths

---

### Device Coverage Matrix

**Priority Tiers:**

**Tier 1 (Must Test):**
- Latest iPhone (iOS current version)
- Latest Samsung Galaxy (Android current version)
- iPad (latest)
- ~60% of user base

**Tier 2 (Should Test):**
- iPhone N-1, N-2 (previous 2 generations)
- Samsung Galaxy N-1, N-2
- Google Pixel (latest)
- One popular low-end Android
- ~30% of user base

**Tier 3 (Nice to Test):**
- Older devices (N-3, N-4)
- Various manufacturers (Xiaomi, OnePlus, etc.)
- Tablets
- ~10% of user base

**Example Matrix:**
```
Device                 | OS Version | Screen Size | Priority
-----------------------|------------|-------------|----------
iPhone 15 Pro          | iOS 17     | 6.1"        | Tier 1
iPhone 14              | iOS 16     | 6.1"        | Tier 2
iPhone 13              | iOS 15     | 6.1"        | Tier 2
iPad Pro               | iOS 17     | 12.9"       | Tier 1
Samsung Galaxy S24     | Android 14 | 6.2"        | Tier 1
Samsung Galaxy S23     | Android 13 | 6.1"        | Tier 2
Google Pixel 8         | Android 14 | 6.2"        | Tier 2
Xiaomi Redmi Note 12   | Android 13 | 6.67"       | Tier 3
```

---

## Mobile Automation with Appium

### Setup

**Install Appium:**
```bash
npm install -g appium
appium driver install xcuitest  # iOS
appium driver install uiautomator2  # Android
```

**Capabilities (iOS):**
```javascript
const caps = {
  platformName: 'iOS',
  'appium:platformVersion': '17.0',
  'appium:deviceName': 'iPhone 15',
  'appium:automationName': 'XCUITest',
  'appium:app': '/path/to/app.ipa',
  'appium:noReset': true,
  'appium:fullReset': false
};
```

**Capabilities (Android):**
```javascript
const caps = {
  platformName: 'Android',
  'appium:platformVersion': '14',
  'appium:deviceName': 'Pixel 8',
  'appium:automationName': 'UiAutomator2',
  'appium:app': '/path/to/app.apk',
  'appium:appPackage': 'com.example.app',
  'appium:appActivity': '.MainActivity'
};
```

---

### Cross-Platform Tests

**Page Object Pattern:**
```javascript
class LoginPage {
  get emailInput() {
    return platform === 'iOS'
      ? $('~email-input')  // accessibility id
      : $('android=new UiSelector().resourceId("email")');
  }

  get passwordInput() {
    return platform === 'iOS'
      ? $('~password-input')
      : $('android=new UiSelector().resourceId("password")');
  }

  get loginButton() {
    return platform === 'iOS'
      ? $('~login-button')
      : $('android=new UiSelector().text("Login")');
  }

  async login(email, password) {
    await this.emailInput.setValue(email);
    await this.passwordInput.setValue(password);
    await this.loginButton.click();
  }
}

// Use in tests
test('user can login', async () => {
  const loginPage = new LoginPage();
  await loginPage.login('test@example.com', 'password123');

  expect(await dashboardPage.isDisplayed()).toBe(true);
});
```

---

## Mobile Performance Testing

### Key Metrics

**Performance Goals:**
- **App Launch:** < 2 seconds
- **Screen Transition:** < 300ms
- **Network Request:** < 1 second
- **Frame Rate:** 60 FPS (no jank)
- **Battery Drain:** < 5%/hour (background)
- **Memory Usage:** < 150MB (typical app)

**Measuring with Appium:**
```javascript
// Get performance data
const perfData = await driver.getPerformanceData('com.example.app', 'cpuinfo', 5);
console.log('CPU Usage:', perfData);

const memData = await driver.getPerformanceData('com.example.app', 'memoryinfo', 5);
console.log('Memory Usage:', memData);
```

**iOS Instruments:**
```bash
# Measure launch time
instruments -t "Time Profiler" -D trace.trace -w "iPhone 15" MyApp.app

# Measure memory
instruments -t "Allocations" -D memory.trace -w "iPhone 15" MyApp.app
```

**Android Profiler:**
```bash
# Measure CPU
adb shell dumpsys cpuinfo | grep com.example.app

# Measure memory
adb shell dumpsys meminfo com.example.app

# Measure battery
adb shell dumpsys batterystats --reset
# Use app for 1 hour
adb shell dumpsys batterystats com.example.app
```

---

## Using with QE Agents

### qe-mobile-tester: Intelligent Cross-Platform Testing

```typescript
// Agent orchestrates mobile testing across devices
const results = await agent.executeMobileTests({
  platforms: ['iOS', 'Android'],
  deviceTiers: [1, 2], // Tier 1 and 2 devices
  tests: 'regression-suite',
  parallelDevices: 5
});

// Returns:
// {
//   iOS: {
//     iPhone15: { passed: 47, failed: 0 },
//     iPhone14: { passed: 46, failed: 1 }
//   },
//   Android: {
//     GalaxyS24: { passed: 45, failed: 2 },
//     Pixel8: { passed: 47, failed: 0 }
//   },
//   totalTime: '15 minutes',
//   deviceFarmCost: '$8.50'
// }
```

### Device Farm Integration

```typescript
// Agent connects to BrowserStack/Sauce Labs
await agent.runOnDeviceFarm({
  service: 'browserstack',
  devices: [
    'iPhone 15 - iOS 17',
    'Samsung Galaxy S24 - Android 14',
    'iPad Pro - iOS 17'
  ],
  tests: 'smoke-suite',
  recordVideo: true,
  captureNetworkLogs: true
});

// Automatically distributes tests across devices
// Captures screenshots, videos, logs
// Generates consolidated report
```

---

## Related Skills

**Core Testing:**
- [agentic-quality-engineering](../agentic-quality-engineering/) - Mobile testing agents
- [regression-testing](../regression-testing/) - Mobile regression
- [performance-testing](../performance-testing/) - Mobile performance

**Specialized:**
- [accessibility-testing](../accessibility-testing/) - Mobile a11y (VoiceOver, TalkBack)
- [security-testing](../security-testing/) - Mobile security
- [compatibility-testing](../compatibility-testing/) - Device compatibility

---

## Remember

**Mobile is not a smaller desktop - it's a different platform.**

Unique challenges:
- Device fragmentation (1000+ devices)
- Touch gestures, not mouse clicks
- Sensors, permissions, offline scenarios
- Intermittent networks, battery constraints
- Platform differences (iOS ≠ Android)

**Test on real devices for critical flows.**

Emulators catch 80% of bugs, but real devices are essential for:
- Actual performance
- Real sensor behavior
- Network reliability
- Platform-specific quirks

**With Agents:** `qe-mobile-tester` orchestrates testing across device farms, manages platform differences, and provides comprehensive mobile testing at scale. Use agents to test 10+ devices in parallel and reduce mobile testing time from days to hours.
