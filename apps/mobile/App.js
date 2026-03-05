import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * Placeholder React Native application for the LifePass mobile client.  This skeleton app
 * displays a simple welcome message.  Future iterations should integrate a wallet
 * connector, proof generation UI, and API calls similar to the web version.
 */
export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>LifePass Mobile</Text>
      <Text style={styles.subtitle}>This is a placeholder app.  Coming soon!</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold'
  },
  subtitle: {
    marginTop: 8,
    fontSize: 16,
    color: '#666'
  }
});