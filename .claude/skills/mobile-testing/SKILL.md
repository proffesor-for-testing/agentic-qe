---
name: mobile-testing
description: "Test iOS and Android apps across device tiers using Appium and device farms, validate touch gestures and permissions flows, verify offline mode and network transitions, and manage device fragmentation strategy. Use when testing native apps, hybrid apps (React Native, Flutter), mobile web, or preparing for app store submission."
---

# Mobile Testing

<default_to_action>
When testing mobile applications:
1. DEFINE device coverage matrix (Tier 1: 60%, Tier 2: 30%, Tier 3: 10%)
2. TEST platform differences (iOS ≠ Android: back button, permissions, UI)
3. VALIDATE touch gestures (tap, swipe, pinch, long-press)
4. TEST mobile-specific scenarios (offline, low battery, interruptions)
5. USE real devices for critical paths, emulators for fast feedback

**Quick Mobile Checklist:**
- Test on latest iOS + Android flagship devices
- Test offline mode and network transitions
- Verify push notifications work
- Test gesture interactions (swipe, pinch)
- Check permissions flow (camera, location, notifications)

**Critical Success Factors:**
- Emulators for 80% of testing, real devices for 20% critical paths
- Test on devices your users actually use (analytics)
- Device fragmentation is Android's biggest challenge
</default_to_action>

## Quick Reference Card

### When to Use
- Native app development (iOS/Android)
- Hybrid apps (React Native, Flutter)
- Mobile web / PWAs
- App store submission preparation

### iOS vs Android Differences
| Aspect | iOS | Android |
|--------|-----|---------|
| OS Versions | 2-3 supported | 10+ in use |
| Devices | ~40 models | 1000+ variants |
| Back Button | Gesture/nav | Hardware/software |
| Permissions | Single prompt | Runtime granular |
| App Store | Strict review | Google Play + sideload |

### Device Coverage Tiers
| Tier | Coverage | Devices |
|------|----------|---------|
| **Tier 1** | 60% users | iPhone 15, Galaxy S24, iPad |
| **Tier 2** | 30% users | iPhone 14/13, Pixel 8 |
| **Tier 3** | 10% users | Older devices, other manufacturers |

---

## Mobile-Specific Scenarios

```javascript
// Offline mode testing
test('app works offline', async () => {
  await driver.toggleAirplaneMode();

  await driver.findElement('view-saved-items').click();
  const items = await driver.findElements('saved-item');
  expect(items.length).toBeGreaterThan(0);

  const banner = await driver.findElement('offline-banner');
  expect(banner.getText()).toContain('No internet');

  await driver.toggleAirplaneMode(); // Restore
});

// Location testing
test('location-based features', async () => {
  await driver.setGeoLocation({
    latitude: 37.7749,
    longitude: -122.4194,
    altitude: 0
  });

  const stores = await driver.findElement('stores-list');
  expect(stores.getText()).toContain('San Francisco');
});

// Permission testing (Android)
test('camera permission flow', async () => {
  await driver.findElement('take-photo').click();

  // Handle permission dialog
  await driver.findElement(
    'com.android.packageinstaller:id/permission_allow_button'
  ).click();

  expect(await driver.findElement('camera-view')).toBeDefined();
});
```

---

## Agent-Driven Mobile Testing

```typescript
// Cross-platform mobile testing
await Task("Mobile Test Suite", {
  platforms: ['iOS', 'Android'],
  deviceTiers: [1, 2],
  tests: 'regression-suite',
  parallelDevices: 5,
  deviceFarm: 'browserstack'
}, "qe-test-executor");

// Device farm integration
await Task("Device Farm Execution", {
  service: 'browserstack',
  devices: [
    'iPhone 15 - iOS 17',
    'Samsung Galaxy S24 - Android 14'
  ],
  recordVideo: true,
  captureNetworkLogs: true
}, "qe-test-executor");
```

---

## Agent Coordination Hints

### Memory Namespace
```
aqe/mobile-testing/
├── device-matrix/*      - Device coverage strategy
├── platform-tests/*     - iOS/Android specific tests
├── gesture-library/*    - Reusable gesture patterns
└── performance/*        - Mobile performance metrics
```

### Fleet Coordination
```typescript
const mobileFleet = await FleetManager.coordinate({
  strategy: 'mobile-testing',
  agents: [
    'qe-test-executor',       // Cross-platform execution
    'qe-performance-tester',  // Mobile performance
    'qe-visual-tester'        // Screen size validation
  ],
  topology: 'parallel'
});
```

---

## Related Skills
- [accessibility-testing](../accessibility-testing/) - VoiceOver, TalkBack
- [performance-testing](../performance-testing/) - Mobile performance
- [compatibility-testing](../compatibility-testing/) - Device compatibility

---

## Remember

**Test on real devices for critical flows.** Emulators catch 80% of bugs but real devices are needed for actual performance, sensor behavior, and platform quirks.

**With Agents:** `qe-test-executor` orchestrates testing across device farms, manages platform differences, and tests 10+ devices in parallel.
