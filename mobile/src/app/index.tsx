import { StyleSheet, Text, View } from 'react-native';

import { useColors } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

export default function Index() {
  const colors = useColors();
  return (
    <View style={styles.root}>
      <Text style={{ color: colors.text, fontSize: 40 }}>Aura</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.screen },
});
