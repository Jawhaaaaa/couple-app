import { Tabs } from 'expo-router/js-tabs';

import { TabBar } from '@/components/TabBar';
import { useWideLayout } from '@/hooks/useWideLayout';

/** 5 табын навигаци (DD-AURA-035): утас/таблетэд доор, вэб ≥ 1024 px-д зүүн талд. */
export default function TabsLayout() {
  const { isDesktopWeb } = useWideLayout();
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} vertical={isDesktopWeb} />}
      screenOptions={{ headerShown: false, tabBarPosition: isDesktopWeb ? 'left' : 'bottom' }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="memories" />
      <Tabs.Screen name="chat" />
      <Tabs.Screen name="plans" />
      <Tabs.Screen name="together" />
    </Tabs>
  );
}
