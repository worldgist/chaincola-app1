import { Tabs } from 'expo-router';
import React from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#6B46C1',
        tabBarInactiveTintColor: '#9CA3AF',
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E5E7EB',
          height: 85,
          paddingBottom: 15,
          paddingTop: 12,
          paddingHorizontal: 5,
          elevation: 8,
          shadowColor: '#6B46C1',
          shadowOffset: {
            width: 0,
            height: -2,
          },
          shadowOpacity: 0.1,
          shadowRadius: 8,
        },
        tabBarLabelStyle: {
          fontSize: 13,
          fontWeight: '600',
          marginTop: 6,
          marginBottom: 0,
        },
        tabBarIconStyle: {
          marginTop: 0,
          marginBottom: 4,
        },
        tabBarItemStyle: {
          paddingVertical: 6,
          justifyContent: 'center',
          alignItems: 'center',
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol 
              size={28} 
              name="house.fill" 
              color={focused ? '#6B46C1' : '#9CA3AF'} 
            />
          ),
          tabBarLabel: 'Home',
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: 'Wallet',
          tabBarIcon: ({ color, focused }) => (
            <MaterialIcons 
              name="account-balance-wallet" 
              size={28} 
              color={focused ? '#6B46C1' : '#9CA3AF'} 
            />
          ),
          tabBarLabel: 'Wallet',
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Transactions',
          tabBarIcon: ({ color, focused }) => (
            <MaterialIcons 
              name="history" 
              size={28} 
              color={focused ? '#6B46C1' : '#9CA3AF'} 
            />
          ),
          tabBarLabel: 'Transactions',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <MaterialIcons 
              name="person" 
              size={28} 
              color={focused ? '#6B46C1' : '#9CA3AF'} 
            />
          ),
          tabBarLabel: 'Profile',
        }}
      />
    </Tabs>
  );
}
