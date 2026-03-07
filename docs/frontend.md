# Frontend Guide

This document provides instructions for running and extending the LifePass web interface.

## Web (Next.js)

The web client is located under `apps/web`.  It uses Next.js and React to provide a simple interface for submitting a zero‑knowledge proof and minting a LifePass SBT.

### Running the Web App

1. Navigate to the `apps/web` directory.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Visit `http://localhost:3000` in your browser.

For local development, the web app proxies `/proof`, `/sbt`, and `/flow` to `LOCAL_API_BASE_URL` (default `http://localhost:3003`) via Next.js rewrites.

For deployed environments (for example Vercel), set:

- `NEXT_PUBLIC_API_BASE_URL=https://<your-api-domain>`

and ensure your API service allows CORS from the web app domain.

### Recommended Production Deployment (Vercel)

1. Create a Vercel project with root directory `apps/web`.
2. Add environment variables in Vercel Project Settings:
  - `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
  - `NEXT_PUBLIC_API_BASE_URL` (public HTTPS URL of your deployed API)
3. Deploy the API service separately (Render/Railway/Fly/VM).
4. Trigger a redeploy of the Vercel app after env vars are set.

This split deployment is required because local rewrites target `localhost` and are development-only.

### Extending the Interface

Future enhancements include:

- Integrating WalletConnect or MetaMask to automatically populate the wallet address and sign transactions.
- Providing a UI for generating the zero‑knowledge proof (e.g., collecting birth date and computing witness inputs in the browser).
- Displaying the user’s minted LifePass tokens and verification level.

### Wallet Integration

To replace the manual wallet address input with a real wallet connector, you can integrate `wagmi` and `@rainbow-me/rainbowkit` into your Next.js app.  These libraries provide hooks and components for connecting to Ethereum wallets (including MetaMask and WalletConnect) and for signing transactions.

1. Install the dependencies in `apps/web`:

   ```bash
   npm install wagmi @rainbow-me/rainbowkit
   ```

2. In `apps/web/pages/_app.js`, wrap your application with `WagmiConfig` and `RainbowKitProvider` and configure supported chains (e.g., Polygon Mumbai):

   ```jsx
   import { WagmiConfig, createConfig, configureChains } from 'wagmi';
   import { publicProvider } from 'wagmi/providers/public';
   import { polygonMumbai } from 'wagmi/chains';
   import { RainbowKitProvider, getDefaultWallets } from '@rainbow-me/rainbowkit';

   const { chains, publicClient } = configureChains([
     polygonMumbai,
   ], [publicProvider()]);

   const { connectors } = getDefaultWallets({ appName: 'LifePass', chains });
   const config = createConfig({ autoConnect: true, connectors, publicClient });

   export default function App({ Component, pageProps }) {
     return (
       <WagmiConfig config={config}>
         <RainbowKitProvider chains={chains}>
           <Component {...pageProps} />
         </RainbowKitProvider>
       </WagmiConfig>
     );
   }
   ```

3. In your `pages/index.js`, import and use the `ConnectButton` component from `@rainbow-me/rainbowkit` to allow users to connect their wallet:

   ```jsx
   import { ConnectButton } from '@rainbow-me/rainbowkit';
   // inside your component:
   <ConnectButton />
   ```

Once connected, you can obtain the user’s address from wagmi hooks (e.g., `useAccount`) and remove the manual wallet input field.

## Mobile (React Native)

The mobile client under `apps/mobile` is a placeholder React Native app.  To run it, set up a React Native environment with Expo or the React Native CLI and install the dependencies defined in `apps/mobile/package.json`.  Future work should mirror the functionality of the web client and integrate native wallet connectors.