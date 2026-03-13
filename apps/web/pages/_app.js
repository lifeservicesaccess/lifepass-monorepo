import '../styles/globals.css';
import { WagmiConfig, createClient, configureChains } from 'wagmi';
import { publicProvider } from '@wagmi/core/providers/public';
import { polygonMumbai } from 'wagmi/chains';
import { RainbowKitProvider, getDefaultWallets } from '@rainbow-me/rainbowkit';

/**
 * Custom App component used by Next.js.  This file sets up the wagmi and
 * RainbowKit providers so that wallet connections are available across
 * all pages.  We configure the polygonMumbai testnet here, but you can
 * replace it with any supported chain.
 */

// Configure supported chains and providers.  Add additional chains as needed.
const { chains, provider } = configureChains(
  [polygonMumbai],
  [publicProvider()]
);

// Obtain default connectors (MetaMask, WalletConnect, etc.) for RainbowKit.
// WalletConnect v2 requires a projectId. Provide it via NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID.
const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'dev-walletconnect-project-id';
if (!process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID) {
  // Log a clear message for developers — runtime will still run but walletconnect won't work.
  // It's recommended to set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in your .env.local.
  // Example: NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id
  console.warn('NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set — using dev fallback projectId for local/CI build only.');
}
const { connectors } = getDefaultWallets({
  appName: 'LifePass',
  chains,
  projectId: walletConnectProjectId
});

// Create the wagmi config used by the WagmiConfig provider.  Auto-connect
// automatically attempts to reconnect to a previously connected wallet.
const wagmiClient = createClient({
  autoConnect: true,
  connectors,
  provider
});

export default function MyApp({ Component, pageProps }) {
  return (
    <WagmiConfig client={wagmiClient}>
      <RainbowKitProvider chains={chains}>
        <Component {...pageProps} />
      </RainbowKitProvider>
    </WagmiConfig>
  );
}