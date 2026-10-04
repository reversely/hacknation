import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import type { GoogleApi } from '../store/google';
import type { LocalStore } from '../store/localStore';
import { WEBSITE_URL_KEY } from '../website/appsScriptWebsite';
import { publishedFarm } from './publication';
import { renderWebsitePreviewHtml, validateWebsitePage } from './websiteCreator';

// The published website, as the Apps Script page renders it from the Farm row. Publishing happens
// in the chat: approving the profile there writes the row (docs/website-creator.md). Until the row
// reaches the spreadsheet, this view renders it from the phone's own copy.
export function WebsiteCreatorScreen({ store }: { store: LocalStore; google: GoogleApi }) {
  const [farm] = useState(() => publishedFarm(store));
  const websiteUrl = store.getMeta(WEBSITE_URL_KEY);
  const waiting = store.outbox().some((entry) => entry.type === 'save_profile' && entry.status !== 'COMPLETED');

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Website</Text>
      {!farm ? (
        <Text style={styles.detail}>Tell Wren about your tour in the Agent tab and approve the profile. Your page appears here.</Text>
      ) : (
        <>
          <Text style={styles.detail}>
            {!websiteUrl
              ? 'Published on this phone. Build the public website in Setup to put it online.'
              : waiting
                ? 'Published on this phone. It goes online when your Google account syncs.'
                : 'Your public website shows this page.'}
          </Text>
          {websiteUrl && (
            <Pressable onPress={() => void Linking.openURL(websiteUrl)} accessibilityRole="link">
              <Text style={styles.link}>Open your website: {websiteUrl}</Text>
            </Pressable>
          )}
          <View style={styles.preview}>
            <WebView
              source={{ html: renderWebsitePreviewHtml(farm, validateWebsitePage(farm.page)) }}
              originWhitelist={['*']}
              javaScriptEnabled={false}
              domStorageEnabled={false}
              accessibilityLabel="Your published farm website"
            />
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, flexGrow: 1 },
  title: { fontSize: 22, fontWeight: '700', color: '#1d2c20' },
  detail: { fontSize: 14, lineHeight: 20, color: '#425247' },
  link: { fontSize: 14, lineHeight: 20, color: '#315c3a', textDecorationLine: 'underline' },
  preview: { height: 600, overflow: 'hidden', borderWidth: 1, borderColor: '#d9dfd5', borderRadius: 14 },
});
