# SOYER EXCHANGE — Android app

A separate Expo / React Native Android client. It does not replace or modify the existing website or Telegram Mini App.

## Features
- Email + password registration and login through Supabase Auth.
- Secure session persistence with Expo SecureStore.
- Live exchange rates loaded from the existing API `/api/settings`.
- Two-way editable calculator (changing either amount recalculates the other).
- Authenticated exchange-request creation and personal request history.
- Profile and support link.

The app only creates a request for a manager to review. It does not accept funds, execute transfers, or claim that an exchange has been completed.

## 1. Create and configure Supabase
1. Create a Supabase project.
2. In Authentication -> Providers, enable Email. For production, keep email confirmation enabled.
3. Open SQL Editor and run the complete contents of `supabase-schema.sql`.
4. In Project Settings -> API, copy the Project URL and the public anon/publishable key. Never put a service-role key in the mobile app.

## 2. Configure the app
From this directory, copy the example environment file:

```powershell
Copy-Item .env.example .env
notepad .env
```

Set:
- `EXPO_PUBLIC_API_URL=https://soyer-exchange-api.onrender.com`
- `EXPO_PUBLIC_SUPABASE_URL` to your Supabase project URL.
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` to the public anon/publishable key.

These public client values are not server secrets. Do not add service-role keys, database passwords, or bot tokens to this file.

## 3. Run locally on Windows
Install Node.js LTS, then:

```powershell
cd mobile
npm install
npx expo start
```

Install Expo Go on an Android phone and scan the QR code. For a native development build or standalone APK, use EAS Build.

## 4. Build an Android APK
Install and sign in to EAS:

```powershell
npm install -g eas-cli
eas login
eas build:configure
```

Create `eas.json` with an APK preview profile, then run:

```powershell
eas build --platform android --profile preview
```

The build service returns the APK link after a successful build.

## Security notes
- Supabase Auth manages password hashing and sessions; passwords are never stored by this app.
- Row Level Security limits each signed-in user to their own exchange requests.
- Never put a Supabase service-role key in the app.
- Before any real-money or crypto-exchange activity, a responsible adult and qualified legal/compliance professionals must review the service, applicable laws, licensing, KYC/AML, privacy, and consumer-protection requirements.