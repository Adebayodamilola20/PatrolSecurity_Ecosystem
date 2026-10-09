# Mobile App — Page Structure & Navigation

## App Flow Overview

```
Splash Screen
    │
    ▼
Login Screen ─────────────────────────────────────┐
    │                                               │
    ▼                                               │
Home / Dashboard                                    │
    │                                               │
    ├──▶ QR Scanner ──▶ Scan Result ──▶ Back to Home│
    │                                               │
    ├──▶ Scan History ──▶ Scan Detail               │
    │                                               │
    ├──▶ Checkpoints ──▶ Checkpoint Detail          │
    │                                               │
    ├──▶ Profile                                    │
    │                                               │
    └──▶ Settings                                   │
    │                                               │
    └──▶ Logout ────────────────────────────────────┘
```

---

## Route Table

| Route | Screen | Description |
|---|---|---|
| `/splash` | SplashScreen | App loading, auto-login check |
| `/login` | LoginScreen | Guard authentication |
| `/home` | HomeScreen | Main dashboard with quick actions |
| `/scanner` | ScannerScreen | QR code scanner (camera view) |
| `/scan-result` | ScanResultScreen | Success/failure after QR scan |
| `/history` | HistoryScreen | List of past patrol scans |
| `/history/:id` | ScanDetailScreen | Full scan details |
| `/checkpoints` | CheckpointsScreen | List/map of all checkpoints |
| `/checkpoints/:id` | CheckpointDetailScreen | Checkpoint info + QR code |
| `/profile` | ProfileScreen | Guard profile & stats |
| `/settings` | SettingsScreen | App preferences |

---

## Screen Details

### 1. SplashScreen
```
┌──────────────────────┐
│                      │
│    [Shield Icon]     │
│   Patrol Command     │
│   v1.0.0 Loading...  │
│                      │
│  ────[Progress]────  │
│                      │
│     © 2026 Company   │
└──────────────────────┘
```
- **Logic:** Check stored JWT token → valid → go to `/home`, expired → go to `/login`
- **State:** Auto-login attempt with loading spinner

---

### 2. LoginScreen
```
┌──────────────────────┐
│                      │
│    [Shield Icon]     │
│   Patrol Command     │
│                      │
│  ┌────────────────┐  │
│  │ Email           │  │
│  └────────────────┘  │
│                      │
│  ┌────────────────┐  │
│  │ Password   [👁] │  │
│  └────────────────┘  │
│                      │
│  ┌────────────────┐  │
│  │   Sign In      │  │
│  └────────────────┘  │
│                      │
│  Offline Mode?       │
│  [Use Last Sync]     │
│                      │
└──────────────────────┘
```
- **Fields:** Email, Password (with show/hide toggle)
- **Button:** Sign In — calls backend auth, stores JWT in flutter_secure_storage
- **Offline:** "Use Last Sync" button for offline access (uses cached credentials)
- **Error states:** Invalid credentials, network error, account disabled

---

### 3. HomeScreen (Dashboard)
```
┌──────────────────────┐
│  [Profile]  Home [🔔]│  ← AppBar
├──────────────────────┤
│  Good morning, John  │
│  You're on duty      │
│                      │
│  ┌──────┬──────┐    │
│  │Today │ Total│    │
│  │ 12   │ 156  │    │
│  │Scans │ Scans│    │
│  └──────┴──────┘    │
│                      │
│  ┌──────────────────┐│
│  │  📷 Scan QR      ││  ← Big CTA button
│  │  Check in now    ││
│  └──────────────────┘│
│                      │
│  ┌──────┬──────┬───┐ │
│  │📋    │📍    │👤 │ │
│  │Recent│Points│ Me │ │
│  │Scans │      │    │ │
│  └──────┴──────┴───┘ │
│                      │
│  Recent Activity     │
│  • Main Gate - 2m ago│
│  • Warehouse - 15m   │
│  • Parking Lot - 32m │
│       [View All]     │
└──────────────────────┘
```
- **Quick Stats:** Today's scans, total scans this shift
- **Primary CTA:** Big "Scan QR" button — main action guards perform
- **Quick Actions:** Recent scans, checkpoints, profile
- **Activity Feed:** Last 5 scans with timestamps

---

### 4. ScannerScreen (Main Feature)
```
┌──────────────────────┐
│  ← Back    Scan QR   │
├──────────────────────┤
│                      │
│    ┌────────────┐    │
│    │  Camera    │    │
│    │  Preview   │    │
│    │            │    │
│    │   [QR]     │    │
│    │   Frame    │    │
│    │            │    │
│    └────────────┘    │
│                      │
│  GPS: [Verifying...] │
│  Location: Main Gate │
│                      │
│  [Flashlight] [Gallery]│
│                      │
│  ┌──────────────────┐│
│  │  Point camera at  ││
│  │  checkpoint QR    ││
│  └──────────────────┘│
└──────────────────────┘
```
- **Camera:** Full-screen QR scanner using `mobile_scanner` package
- **Overlay:** Scanning frame with corner brackets
- **GPS Status:** Shows GPS signal strength, latitude/longitude
- **Auto-Scan:** Automatically detects QR, no button press needed
- **Flashlight:** Toggle for dark environments
- **Gallery:** Pick QR image from gallery (fallback)
- **Sound/Vibration:** Haptic feedback on successful scan

---

### 5. ScanResultScreen
```
┌──────────────────────┐
│  ← Back    Result    │
├──────────────────────┤
│                      │
│   ✅ Scan Verified   │  ← Green = GPS match
│   ┌──────────────┐   │
│   │ ✓ Check-in   │   │
│   │   Successful │   │
│   └──────────────┘   │
│                      │
│   Checkpoint:        │
│   Main Entrance (A1) │
│                      │
│   Officer:           │
│   John Doe           │
│                      │
│   Time:              │
│   May 10, 2026 2:30PM│
│                      │
│   Location:          │
│   6.5244, 3.3792     │
│   ✅ GPS Verified   │
│   (12m from CP)     │
│                      │
│  ┌──────────────────┐│
│  │  Add Note / Photo ││
│  └──────────────────┘│
│                      │
│  ┌──────────────────┐│
│  │    Scan Next      ││  ← Returns to scanner
│  └──────────────────┘│
│                      │
│  ┌──────────────────┐│
│  │  Back to Home    ││
│  └──────────────────┘│
└──────────────────────┘
```
- **Status indicator:** Green check (GPS valid) or Red X (GPS mismatch)
- **Scan info:** Checkpoint name, code, officer name, timestamp
- **GPS details:** Coordinates, distance from checkpoint, validation status
- **Add Note/Photo:** Optional — guard can add observations, take a photo
- **Two CTAs:** "Scan Next" (back to camera) and "Back to Home"

**GPS Mismatch State:**
```
┌──────────────────────┐
│   ⚠️ GPS Mismatch    │  ← Yellow/Red
│   Scan flagged for   │
│   supervisor review  │
│                      │
│   Your location is   │
│   120m away from     │
│   checkpoint zone    │
│                      │
│  [Continue Anyway]   │
│  [Scan Again]        │
└──────────────────────┘
```

---

### 6. HistoryScreen
```
┌──────────────────────┐
│  ← Back  Scan History│
├──────────────────────┤
│  [🔍 Search scans...]│
│                      │
│  [Today] [Week] [All]│  ← Filter tabs
│                      │
│  ┌──────────────────┐│
│  │✅ Main Gate      ││
│  │    2:30 PM       ││
│  │    John Doe      ││
│  ├──────────────────┤│
│  │✅ Warehouse B    ││
│  │    2:15 PM       ││
│  │    John Doe      ││
│  ├──────────────────┤│
│  │⚠️ Parking Lot   ││  ← Flagged item
│  │    1:45 PM       ││
│  │    GPS Mismatch  ││
│  ├──────────────────┤│
│  │✅ Admin Building ││
│  │    1:00 PM       ││
│  │    John Doe      ││
│  └──────────────────┘│
│                      │
│      [Load More]     │
└──────────────────────┘
```
- **Filter tabs:** Today, This Week, All Time
- **Search:** By checkpoint name, code, or officer
- **List items:** Status icon, checkpoint name, time, distance
- **Pull-to-refresh:** Refresh from backend
- **Infinite scroll:** Paginated load more
- **Tap item:** Navigate to Scan Detail

---

### 7. ScanDetailScreen
```
┌──────────────────────┐
│  ← Back  Scan Detail │
├──────────────────────┤
│  ┌──────────────────┐│
│  │   Mini Map       ││  ← Small map preview
│  └──────────────────┘│
│                      │
│  Checkpoint:         │
│  Main Entrance (A1)  │
│  Location: Front Gate│
│                      │
│  Officer:            │
│  John Doe            │
│  ID: OFF-001         │
│                      │
│  Scanned:            │
│  May 10, 2026        │
│  2:30:45 PM          │
│                      │
│  GPS:                │
│  Lat: 6.5244         │
│  Lng: 3.3792         │
│  Distance: 12m ✅    │
│                      │
│  Notes:              │
│  "Gate secured. All  │
│   clear."            │
│                      │
│  Photo: [View]       │  ← If photo attached
│                      │
│  Status: Verified    │
└──────────────────────┘
```
- **Header:** Status badge (Verified/Flagged)
- **Map:** Small static map showing scan location
- **Details:** Checkpoint, officer, timestamp, GPS coordinates
- **Notes:** Display patrol notes if added
- **Photo:** Show attached photo if available

---

### 8. CheckpointsScreen
```
┌──────────────────────┐
│  ← Back  Checkpoints │
├──────────────────────┤
│  [Map] [List]        │  ← View toggle
│                      │
│  ┌─── MAP VIEW ────┐│
│  │                 ││
│  │  📍📍  📍      ││
│  │       📍       ││
│  │  📍      📍    ││
│  └────────────────┘│
│                      │
│  OR                  │
│                      │
│  ┌─── LIST VIEW ───┐│
│  │📍 Main Entrance ││
│  │   A1 - Active   ││
│  ├────────────────┤│
│  │📍 Warehouse B  ││
│  │   B3 - Active   ││
│  ├────────────────┤│
│  │📍 Parking Lot  ││
│  │   C1 - Active   ││
│  └────────────────┘│
└──────────────────────┘
```
- **View Toggle:** Switch between Map view and List view
- **Map View:** Shows all checkpoint locations on a map
- **List View:** Scrollable list with name, code, status
- **Tap item:** Navigate to Checkpoint Detail

---

### 9. CheckpointDetailScreen
```
┌──────────────────────┐
│  ← Back  Main Gate   │
├──────────────────────┤
│  Status: Active ✅   │
│                      │
│  Code: A1            │
│  Location: Front Gate│
│  GPS: 6.5244, 3.3792 │
│  Radius: 50m         │
│                      │
│  ┌──────────────────┐│
│  │  📍 Map          ││
│  └──────────────────┘│
│                      │
│  ┌──────────────────┐│
│  │  📱 Show QR Code ││  ← Guard shows to scanner
│  └──────────────────┘│
│                      │
│  Recent Scans Here:  │
│  • Today 2:30PM - JD │
│  • Today 1:15PM - SS │
│  • May 9  11PM - MJ  │
└──────────────────────┘
```
- **Info:** Name, code, location, GPS coordinates, radius
- **Map:** Shows checkpoint location on map with radius circle
- **QR Display:** Show the checkpoint's QR code (guard can show this)
- **Recent activity:** Last scans at this checkpoint

---

### 10. ProfileScreen
```
┌──────────────────────┐
│  ← Back    Profile   │
├──────────────────────┤
│   [Avatar]           │
│   John Doe           │
│   Patrol Officer     │
│   ID: OFF-001        │
│                      │
│  ┌──────────────────┐│
│  │ Email             ││
│  │ john@company.com ││
│  ├──────────────────┤│
│  │ Phone             ││
│  │ +234 800 000 0000││
│  ├──────────────────┤│
│  │ Shift             ││
│  │ Morning (6AM-2PM)││
│  ├──────────────────┤│
│  │ Member Since      ││
│  │ Jan 15, 2025     ││
│  └──────────────────┘│
│                      │
│  My Stats:           │
│  ┌────┬────┬──────┐ │
│  │156 │ 45 │ 99.3%│ │
│  │Total│This│Accuracy│
│  │     │Week│       │ │
│  └────┴────┴──────┘ │
│                      │
│  [Edit Profile]      │
│  [Settings]          │
│  [Sign Out]          │
└──────────────────────┘
```
- **Header:** Avatar, name, role, badge/ID
- **Info list:** Email, phone, shift, member since
- **Stats cards:** Total scans, weekly scans, accuracy rate
- **Actions:** Edit profile, settings, sign out

---

### 11. SettingsScreen
```
┌──────────────────────┐
│  ← Back   Settings   │
├──────────────────────┤
│  ┌──────────────────┐│
│  │ App Preferences  ││
│  ├──────────────────┤│
│  │ 🔔 Notifications││
│  │ Sound/Vibration  ││
│  ├──────────────────┤│
│  │ Offline Mode     ││
│  │ Cache last 500   ││
│  ├──────────────────┤│
│  │ Dark Mode        ││
│  │ [Toggle]         ││
│  ├──────────────────┤│
│  │ About            ││
│  │ v1.0.0           ││
│  └──────────────────┘│
│                      │
│  [Sign Out]          │  ← Bottom
└──────────────────────┘
```

---

## Navigation Components (Bottom Nav Bar)

The app uses a **bottom navigation bar** on the main screens (Home, Scanner, History, Profile):

```
┌──────────────────────────────────────┐
│                                      │
│           [Screen Content]           │
│                                      │
├──────────────────────────────────────┤
│  🏠    📷        📋    👤          │
│ Home  Scan  [+]  History Profile    │
│              │                      │
│         [FAB - Quick Scan]          │
└──────────────────────────────────────┘
```

- **Tabs:** Home, Scanner (FAB), History, Profile
- **FAB:** Floating Action Button for quick scan access from anywhere
- **Active tab:** Highlighted with accent color

---

## File Structure

```
mobile/patrol_app/lib/
├── main.dart
├── app.dart
├── routes.dart                  # Route definitions
│
├── screens/
│   ├── splash_screen.dart
│   ├── login_screen.dart
│   ├── home_screen.dart
│   ├── scanner_screen.dart
│   ├── scan_result_screen.dart
│   ├── history_screen.dart
│   ├── scan_detail_screen.dart
│   ├── checkpoints_screen.dart
│   ├── checkpoint_detail_screen.dart
│   ├── profile_screen.dart
│   └── settings_screen.dart
│
├── widgets/
│   ├── scan_tile.dart           # Reusable scan list item
│   ├── checkpoint_card.dart     # Checkpoint card widget
│   ├── stats_card.dart          # Stats display card
│   ├── status_badge.dart        # Verified/Flagged badge
│   ├── gps_indicator.dart       # GPS signal strength
│   └── bottom_nav.dart          # Bottom navigation bar
│
├── services/
│   ├── api_service.dart         # HTTP client
│   ├── auth_service.dart        # JWT management
│   ├── scan_service.dart        # Scan submission
│   └── location_service.dart    # GPS tracking
│
├── models/
│   ├── user.dart
│   ├── scan.dart
│   ├── checkpoint.dart
│   └── report.dart
│
├── providers/
│   ├── auth_provider.dart
│   ├── scan_provider.dart
│   └── location_provider.dart
│
└── utils/
    ├── constants.dart
    └── helpers.dart
```

---

## Key Flutter Packages

| Package | Purpose |
|---|---|
| `mobile_scanner` | QR code camera scanning |
| `geolocator` | GPS location capture |
| `flutter_secure_storage` | Secure JWT token storage |
| `http` | REST API calls |
| `provider` or `riverpod` | State management |
| `intl` | Date/time formatting |
| `cached_network_image` | Image caching |
| `flutter_map` + `latlong2` | Map display (OpenStreetMap) |
| `share_plus` | Sharing reports |
