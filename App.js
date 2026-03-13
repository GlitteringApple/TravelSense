import {
  View,
  Text,
  Image,
  ImageBackground,
  ScrollView,
  Button,
  TextInput,
  StyleSheet,
  Pressable,
  StatusBar,
  ActivityIndicator,
  Alert,
  Dimensions,
  Keyboard,
  BackHandler,
  Switch
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import ButtonRound from "./components/ButtonRound"
import GraphCard from './components/GraphCard';
import { useSensorData } from './src/sensors/Sensor';
const mapImg = require("./assets/carte-geographique-du-monde.jpg");
import {
  NavigationContainer,
  createStaticNavigation,
  useNavigation,
} from '@react-navigation/native';
import { createBottomTabNavigator, useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useEffect, useRef, useState } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  DrawerItem,
} from '@react-navigation/drawer';
import Svg, { Polygon } from 'react-native-svg';
import * as Progress from 'react-native-progress';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';
import { Accelerometer, Gyroscope } from "expo-sensors";
import {
  Canvas,
  Path,
  Skia,
  Group,
  useDerivedValue,
} from "@shopify/react-native-skia";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { SettingsProvider, useSettings } from './src/contexts/SettingsContext';

//Icons
import Entypo from '@expo/vector-icons/Entypo';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import AntDesign from '@expo/vector-icons/AntDesign';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Feather from '@expo/vector-icons/Feather';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';

/* ------------------ Screens ------------------ */

const Stack = createNativeStackNavigator();

function DrawerStack() {
  return (
    <Stack.Navigator screenOptions={{
      animation: 'default', headerShown: true
    }}>
      <Stack.Screen name="Home" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="About Us" component={AboutUsScreen} />
    </Stack.Navigator>
  )
}

function HomeScreen() {
  //0 = fully collapsed, 1 = fully expanded
  const progress = useSharedValue(0);
  const maxSearchWidth = useSharedValue(0);
  const screenWidth = Dimensions.get('window').width;
  const [isSearchBarFocused, setSearchBarFocused] = useState(true);
  const inputRef = useRef(null);

  const onLayout = (event) => {
    maxSearchWidth.value = event.nativeEvent.layout.width;
  };

  const toggleInput = () => {
    //If not read-only, focus the text field.
    if (!isSearchBarFocused) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100)
    }
    else {
      inputRef.current?.blur();
    }
  };

  useEffect(() => {
    const keybHidden = Keyboard.addListener('keyboardDidHide', () => toggleSearch());

    return () => {
      keybHidden.remove();
    };
  }, [isSearchBarFocused]);

  //Smoothly animates expansion and collapse from 0 to 1.
  const toggleSearch = () => {
    setSearchBarFocused(!isSearchBarFocused);
    if (isSearchBarFocused) {
      progress.value = withTiming(1, {
        duration: 300,
      });
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100)
    }
    else {
      if (!isSearchBarFocused) {
        inputRef.current?.blur();
        progress.value = withTiming(0, {
          duration: 300,
        });
      }
    }
  };

  //Resizes the input field container.
  const searchBarStyle = useAnimatedStyle(() => {
    return {
      width: interpolate(progress.value, [0, 1], [50, screenWidth - 140]),
    };
  });

  //Fades search bar text in, and search icon out.
  const inputStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(progress.value, [0, 0.4, 1], [0, 0, 1]),
    };
  });

  const iconStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(progress.value, [0, 0.3], [1, 0]),
      transform: [
        {
          scale: interpolate(progress.value, [0, 1], [1, 0.9]),
        },
      ],
    };
  });

  const [barStyle, setBarStyle] = useState('light-content');

  const onRunFunction = (barStyle) => {
    setBarStyle(barStyle);
  };

  //Fullscreen component
  const navigation = useNavigation();
  useEffect(() => {
    const unsubscribe = navigation.addListener('drawerClose', () => {
      onRunFunction('light-content');
    });
    return unsubscribe;
  }, [navigation]);
  return (
    <View style={styles.fullscreen}>
      <MapView provider={PROVIDER_GOOGLE} style={StyleSheet.absoluteFillObject} />
      <StatusBar translucent backgroundColor="transparent" barStyle={barStyle} />
      {/* <ImageBackground source={mapImg} style={{ flex: 1 }}> */}
      <View style={{ flex: 1 }}>
        <SafeAreaView style={styles.wrapper} onLayout={onLayout}>

          <ButtonRound onPress={() => {
            navigation.openDrawer();
            onRunFunction('dark-content')
          }}>
            <Entypo name="menu" size={24} color="black" />
          </ButtonRound>

          <Pressable onPress={toggleSearch} style={{ flex: 0 }}>
            <Animated.View style={[styles.searchContainer, searchBarStyle]}>
              <Animated.View style={[styles.iconWrapper, iconStyle]}>
                <FontAwesome name="search" size={20} color="black" />
              </Animated.View>
              <Animated.View style={[styles.inputWrapper, inputStyle]}>
                <TextInput placeholder="Search TravelSense..." style={styles.input} ref={inputRef} readOnly={isSearchBarFocused} />
              </Animated.View>
            </Animated.View>
          </Pressable>

          <ButtonRound onPress={() => console.log("hello")}>
            <Entypo name="location-pin" size={24} color="black" />
          </ButtonRound>

        </SafeAreaView>
      </View>
    </View>
  );
}

function DataScreen() {
  const padding = 15;
  const tabBarHeight = useBottomTabBarHeight();
  const sensorState = useSensorData();
  const { isDarkMode, colorTheme } = useSettings();

  const themeColors = {
    background: isDarkMode ? '#121212' : '#f5f5f5',
    card: isDarkMode ? '#1e1e1e' : '#ffffff',
    text: isDarkMode ? '#ffffff' : '#000000',
  };

  return (
    <View style={[styles.screen, { padding: padding, backgroundColor: themeColors.background }]}>
      <View style={{ backgroundColor: themeColors.card, borderRadius: 25, height: 150, overflow: 'hidden' }}>
        <View style={{ backgroundColor: colorTheme, flexDirection: 'row' }}>
          <Text style={{ color: 'white', fontWeight: 'bold', left: 12.5, fontSize: 17.5 }}>STATUS: TRAVELLING</Text>
          <Svg height="23" width="100%" viewBox="0 0 20 2">
            <Polygon
              points="0,0 15,0 15,15 20,20"
              fill={colorTheme}
            />
          </Svg>
          <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 17.5, position: "absolute", right: 25 }}>AUTO: ON</Text>
        </View>

        <View style={{ backgroundColor: themeColors.card, flex: 1, padding: padding }}>
          <View style={{ flexDirection: "row" }}>
            <Text style={{ color: themeColors.text, fontSize: 60, fontWeight: "bold", includeFontPadding: false, lineHeight: 50 }}>60</Text>
            <Text style={{ color: themeColors.text, textAlignVertical: "bottom", bottom: 0, marginLeft: 3 }}>km/h</Text>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", marginLeft: 5 }}>
              <View>
                <Text style={{ color: themeColors.text }}>RECORDING: </Text>
                <Text style={{ color: themeColors.text }}>05:13:45</Text>
              </View>
              <View style={{ flex: 1, flexDirection: "row", justifyContent: "space-evenly" }}>
                <ButtonRound size={30} onPress={() => { }}>
                  <FontAwesome5 name="pause" size={15} color={isDarkMode ? 'white' : 'black'} />
                </ButtonRound>
                <ButtonRound size={30} onPress={() => { }}>
                  <FontAwesome5 name="stop" size={15} color={isDarkMode ? 'white' : 'black'} />
                </ButtonRound>
                <ButtonRound size={30} onPress={() => { }}>
                  <Feather name="x" size={15} color={isDarkMode ? 'white' : 'black'} />
                </ButtonRound>
              </View>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", bottom: padding, left: padding, position: "absolute" }}>
            <Text style={{ color: themeColors.text, position: "relative" }}>CONFIDENCE:</Text>
            <Progress.Bar progress={1} animated={false} width={null} borderRadius={0} borderWidth={0} color={"red"} unfilledColor={"pink"} style={{ alignSelf: "center", flex: 1, marginLeft: 10 }} />
            <Progress.Bar progress={1} animated={false} width={null} borderRadius={0} borderWidth={0} color={"gold"} unfilledColor={"lightgoldenrodyellow"} style={{ alignSelf: "center", flex: 1 }} />
            <Progress.Bar progress={0.5} animated={false} width={null} borderRadius={0} borderWidth={0} color={"green"} unfilledColor={"lightgreen"} style={{ alignSelf: "center", flex: 1 }} />
          </View>
        </View>
      </View>
      <Text style={{ color: themeColors.text, fontWeight: "bold", fontSize: 20, padding: 10 }}>Sensors used: </Text>
      <ScrollView style={{ borderRadius: 25 }}>
        <GraphCard title="GPS: " sensor="gps" sensorState={sensorState} isDarkMode={isDarkMode} />
        <GraphCard title="Accl: " sensor="accelerometer" sensorState={sensorState} isDarkMode={isDarkMode} />
        <GraphCard title="Gyro: " sensor="gyroscope" sensorState={sensorState} isDarkMode={isDarkMode} />
        <GraphCard title="Baro: " sensor="barometer" sensorState={sensorState} isDarkMode={isDarkMode} />
        <GraphCard title="Mag:" sensor="magnetometer" sensorState={sensorState} isDarkMode={isDarkMode} />
      </ScrollView>
    </View>
  );
}

function TravelogueScreen() {
  const { isDarkMode } = useSettings();
  const themeColors = {
    background: isDarkMode ? '#121212' : '#f5f5f5',
    text: isDarkMode ? '#ffffff' : '#000000',
  };
  return (
    <View style={[styles.settingsScreen, { backgroundColor: themeColors.background }]}>
      <Text style={{ color: themeColors.text }}>This is the travelogue screen.</Text>
    </View>
  );
}

function SettingsScreen() {
  const {
    isDarkMode,
    toggleDarkMode,
    notificationsEnabled,
    toggleNotifications,
    engineType,
    setEngineType,
    colorTheme,
    setColorTheme,
  } = useSettings();

  const insets = useSafeAreaInsets();
  const themeColors = {
    background: isDarkMode ? '#121212' : '#f5f5f5',
    card: isDarkMode ? '#1e1e1e' : '#ffffff',
    text: isDarkMode ? '#ffffff' : '#000000',
    textSecondary: isDarkMode ? '#aaaaaa' : '#666666',
    border: isDarkMode ? '#333333' : '#e0e0e0',
  };

  const renderEngineButton = (type, label) => (
    <Pressable
      style={[
        styles.engineButton,
        engineType === type && { backgroundColor: colorTheme, borderColor: colorTheme },
        { borderColor: themeColors.border }
      ]}
      onPress={() => setEngineType(type)}
    >
      <Text style={[styles.engineText, { color: engineType === type ? '#ffffff' : themeColors.text }]}>{label}</Text>
    </Pressable>
  );

  const colors = ['#003CB3', '#D32F2F', '#388E3C', '#FBC02D', '#7B1FA2'];

  return (
    <ScrollView style={[styles.settingsScreen, { backgroundColor: themeColors.background }]}>
      <View style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 20 }}>
        <Text style={[styles.headerText, { color: themeColors.text }]}>Settings</Text>

        <View style={[styles.settingsCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <View style={styles.settingRow}>
            <View>
              <Text style={[styles.settingTitle, { color: themeColors.text }]}>Dark Mode</Text>
              <Text style={[styles.settingDesc, { color: themeColors.textSecondary }]}>Toggle application theme</Text>
            </View>
            <Switch
              value={isDarkMode}
              onValueChange={toggleDarkMode}
              trackColor={{ false: '#767577', true: colorTheme }}
              thumbColor={'#ffffff'}
            />
          </View>

          <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: themeColors.border }]}>
            <View>
              <Text style={[styles.settingTitle, { color: themeColors.text }]}>Notifications</Text>
              <Text style={[styles.settingDesc, { color: themeColors.textSecondary }]}>Enable push notifications</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={toggleNotifications}
              trackColor={{ false: '#767577', true: colorTheme }}
              thumbColor={'#ffffff'}
            />
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>VEHICLE</Text>
        <View style={[styles.settingsCard, { backgroundColor: themeColors.card, borderColor: themeColors.border, paddingVertical: 15 }]}>
          <Text style={[styles.settingTitle, { color: themeColors.text, marginBottom: 10, paddingHorizontal: 15 }]}>Engine Type</Text>
          <View style={styles.engineContainer}>
            {renderEngineButton('petrol', 'Petrol')}
            {renderEngineButton('diesel', 'Diesel')}
            {renderEngineButton('electric', 'Electric')}
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>APPEARANCE</Text>
        <View style={[styles.settingsCard, { backgroundColor: themeColors.card, borderColor: themeColors.border, padding: 15 }]}>
          <Text style={[styles.settingTitle, { color: themeColors.text, marginBottom: 15 }]}>Theme Color</Text>
          <View style={styles.colorContainer}>
            {colors.map((c) => (
              <Pressable
                key={c}
                style={[
                  styles.colorCircle,
                  { backgroundColor: c },
                  colorTheme === c && styles.colorSelected
                ]}
                onPress={() => setColorTheme(c)}
              />
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function AboutUsScreen() {
  return (
    <View>
      <Text>This is the about us screen.</Text>
    </View>
  )
}

/* ------------------ Tabs ------------------ */

const Tab = createBottomTabNavigator();

//Dummy component for navigator tabs.
const Empty = () => <View />;

function Tabs() {

  const onPressTravelogue = () => {
    console.log('Travelogue button pressed');
  };

  return (
    <Tab.Navigator screenOptions={{ animation: 'shift', headerShown: true }}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <AntDesign name="home" size={24} color="black" />
          ),
          headerShown: false
        }} />
      <Tab.Screen
        name="My Data"
        component={DataScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <AntDesign name="database" size={24} color="black" />
          )
        }} />
      <Tab.Screen
        name="Travelogue"
        component={TravelogueScreen}
        // listeners={{
        //   tabPress: e => {
        //     e.preventDefault();
        //     onPressTravelogue();
        //   }
        // }}
        options={{
          tabBarIcon: ({ color, size }) => (
            <AntDesign name="book" size={24} color="black" />
          )
        }} />
    </Tab.Navigator>
  )
}

/* ------------------ Custom Drawer ------------------ */

function CustomDrawerContent(props) {
  const { state, navigation } = props;
  const { isDarkMode, colorTheme } = useSettings();
  const themeColors = {
    background: isDarkMode ? '#1e1e1e' : '#ffffff',
    text: isDarkMode ? '#ffffff' : 'black',
    inactiveText: isDarkMode ? '#aaaaaa' : 'gray',
  };

  return (
    <DrawerContentScrollView {...props} style={{ backgroundColor: themeColors.background }}>
      <View style={styles.logoContainer}>
        <Image
          source={require('./assets/travelsense-banner.png')}
          style={styles.logo}
          resizeMode="contain"
          width={310}
        />
      </View>

      <DrawerItem
        label="Home"
        focused={state.index === 0}
        activeTintColor="white"
        inactiveTintColor={themeColors.inactiveText}
        activeBackgroundColor={colorTheme}
        labelStyle={{ color: state.index === 0 ? 'white' : themeColors.text }}
        icon={({ color, size }) => (<AntDesign name="home" size={24} color={state.index === 0 ? 'white' : themeColors.text} />)}
        onPress={() => props.navigation.navigate('Main', { screen: 'HomeScreen' })}
      />
      <DrawerItem
        label="Settings"
        focused={state.index === 1}
        activeTintColor="white"
        inactiveTintColor={themeColors.inactiveText}
        activeBackgroundColor={colorTheme}
        labelStyle={{ color: state.index === 1 ? 'white' : themeColors.text }}
        icon={({ color, size }) => (<AntDesign name="setting" size={24} color={state.index === 1 ? 'white' : themeColors.text} />)}
        onPress={() => props.navigation.navigate('Main', { screen: 'Settings' })}
      />
      <DrawerItem
        label="About Us"
        focused={state.index === 2}
        activeTintColor="white"
        inactiveTintColor={themeColors.inactiveText}
        activeBackgroundColor={colorTheme}
        labelStyle={{ color: state.index === 2 ? 'white' : themeColors.text }}
        icon={({ color, size }) => (<AntDesign name="question-circle" size={24} color={state.index === 2 ? 'white' : themeColors.text} />)}
        onPress={() => props.navigation.navigate('Main', { screen: 'About Us' })}
      />
    </DrawerContentScrollView>
  );
}

/* ------------------ Drawer ------------------ */

const Drawer = createDrawerNavigator();

export default function App({ navigation }) {

  useEffect(() => {
    const backAction = () => {
      if (navigation.canGoBack()) {
        return false;
      }

      Alert.alert(
        'Exit TravelSense',
        'Are you sure you want to exit?',
        [
          { text: 'Not really', style: 'cancel' },
          { text: 'Yes', onPress: () => BackHandler.exitApp() },
        ]
      );
      return true; // prevent default behavior
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

    return () => backHandler.remove();
  }, []);

  return (
    <SettingsProvider>
      <NavigationContainer>
        <Drawer.Navigator
          drawerContent={(props) => <CustomDrawerContent {...props} />}
          screenOptions={{
            headerShown: false, drawerType: "front", detachInactiveScreens: false,
          }}
        >
          <Drawer.Screen name="Main" component={DrawerStack}></Drawer.Screen>
        </Drawer.Navigator>
      </NavigationContainer>
    </SettingsProvider>
  )
}

const styles = StyleSheet.create({
  fullscreen: {
    flex: 1,
    backgroundColor: "black",
  },
  screen: {
    padding: 15,
    flex: 1,
  },
  wrapper: {
    width: "100%",
    padding: 10,
    justifyContent: "left",
    flexDirection: "row",
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 25,
    height: 50,
    padding: 10,
    marginHorizontal: 0,
    borderWidth: 0,
    elevation: 5,
    textAlignVertical: "center",
  },
  searchContainer: {
    height: 50,
    backgroundColor: "white",
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 25,
    overflow: "hidden",
    elevation: 5,
  },
  iconWrapper: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
    width: 50,
    height: 50,
  },
  inputWrapper: {
    flex: 0,
  },
  settingsScreen: {
    padding: 15,
    flex: 1,
  },
  engineContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
  },
  engineButton: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  engineText: {
    fontWeight: '600',
  },
  colorContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  colorCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSelected: {
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  settingsCard: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  settingDesc: {
    fontSize: 13,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    marginLeft: 15,
    marginBottom: 8,
    letterSpacing: 1,
  },
  headerText: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    marginLeft: 5,
  },
  input: {
    color: "gray",
    fontSize: 16,
  },
});