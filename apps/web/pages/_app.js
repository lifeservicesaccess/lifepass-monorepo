import '../styles/globals.css';
import { WagmiConfig, createConfig, configureChains } from 'wagmi';
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
const { chains, publicClient } = configureChains(
  [polygonMumbai],
  [publicProvider()]
);

// Obtain default connectors (MetaMask, WalletConnect, etc.) for RainbowKit.
const { connectors } = getDefaultWallets({
  appName: 'LifePass',
  chains
});

// Create the wagmi config used by the WagmiConfig provider.  Auto-connect
// automatically attempts to reconnect to a previously connected wallet.
const wagmiConfig = createConfig({
  autoConnect: true,
  connectors,
  publicClient
});

export default function MyApp({ Component, pageProps }) {
  return (
    <WagmiConfig config={wagmiConfig}>
      <RainbowKitProvider chains={chains}>
        <Component {...pageProps} />
      </RainbowKitProvider>
    </WagmiConfig>
  );
}