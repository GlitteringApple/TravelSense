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
  BackHandler
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import ButtonRound from "./components/ButtonRound"
import GraphCard from './components/GraphCard';
const mapImg = require("./assets/carte-geographique-du-monde.jpg");
import {
  NavigationContainer,
  createStaticNavigation,
  useNavigation,
} from '@react-navigation/native';
import { createBottomTabNavigator, useBottomTabBarHeight  } from '@react-navigation/bottom-tabs';
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
  });

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
  navigation.addListener('drawerClose', () => {
    onRunFunction('light-content');
  });
  return (
    <View style={styles.fullscreen}>
      <MapView provider={PROVIDER_GOOGLE} style={StyleSheet.absoluteFillObject}/>
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
  console.log(tabBarHeight)
  return (
    <View style={[styles.screen, {padding: padding}]}>
      <View style={{ backgroundColor: '#ffffff', borderRadius: 25, height: 150, overflow: 'hidden' }}>
        <View style={{ backgroundColor: 'lime', flexDirection: 'row' }}>
          <Text style={{ color: 'white', fontWeight: 'bold', left: 12.5, fontSize: 17.5 }}>STATUS: TRAVELLING</Text>
          <Svg height="23" width="100%" viewBox="0 0 20 2">
            <Polygon
              points="0,0 15,0 15,15 20,20"
              fill="green"
            />
          </Svg>
          <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 17.5, position: "absolute", right: 25 }}>AUTO: ON</Text>
        </View>

        <View style={{ backgroundColor: "white", flex: 1, padding: padding }}>
          <View style={{flexDirection: "row" }}>
            <Text style={{ fontSize: 60, fontWeight: "bold", includeFontPadding: false, lineHeight: 50 }}>60</Text>
            <Text style={{ textAlignVertical: "bottom", bottom: 0, marginLeft: 3 }}>km/h</Text>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", marginLeft: 5 }}>
              <View>
              <Text>RECORDING: </Text>
              <Text>05:13:45</Text>
              </View>
              <View style={{ flex: 1, flexDirection: "row", justifyContent: "space-evenly" }}>
                <ButtonRound size={30}>
                  <FontAwesome5 name="pause" size={15} color="black" />
                </ButtonRound>
                <ButtonRound size={30}>
                  <FontAwesome5 name="stop" size={15} color="black" />
                </ButtonRound>
                <ButtonRound size={30}>
                  <Feather name="x" size={15} color="black" />
                </ButtonRound>
              </View>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", bottom: padding, left: padding, position: "absolute" }}>
            <Text style={{position: "relative"}}>CONFIDENCE:</Text>
            <Progress.Bar progress={1} animated={false} width={null} borderRadius={0} borderWidth={0} color={"red"} unfilledColor={"pink"} style={{ alignSelf: "center", flex: 1, marginLeft: 10 }} />
            <Progress.Bar progress={1} animated={false} width={null} borderRadius={0} borderWidth={0} color={"gold"} unfilledColor={"lightgoldenrodyellow"} style={{ alignSelf: "center", flex: 1}} />
            <Progress.Bar progress={0.5} animated={false} width={null} borderRadius={0} borderWidth={0} color={"green"} unfilledColor={"lightgreen"} style={{ alignSelf: "center", flex: 1}} />
          </View>
        </View>
      </View>
        <Text style={{fontWeight: "bold", fontSize: 20, padding: 10 }}>Sensors used: </Text>
        <ScrollView style={{borderRadius: 25}}>
          <GraphCard title="GPS: " sensor="gps"/>
          <GraphCard title="Accl: " sensor="accelerometer"/>
          <GraphCard title="Gyro: " sensor="gyroscope"/>
          <GraphCard title="Baro: " sensor="barometer"/>
          <GraphCard title="Mag:" sensor="magnetometer"/>
          </ScrollView>
    </View>
  );
}

function TravelogueScreen() {
  return (
    <View>
      <Text>This is the travelogue screen.</Text>
    </View>
  );
}

function SettingsScreen() {
  return (
    <View>
      <Text>This is the settings screen.</Text>
    </View>
  )
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
  return (
    <DrawerContentScrollView {...props}>
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
        inactiveTintColor="gray"
        activeBackgroundColor="#003CB3"
        icon={({ color, size }) => (<AntDesign name="home" size={24} color="black" />)}
        //onPress={() => props.navigation.navigate('Main', { screen: 'HomeScreen' })}
        onPress={() => props.navigation.navigate('Main', { screen: 'HomeScreen' })}
      />
      <DrawerItem
        label="Settings"
        focused={state.index === 1}
        activeTintColor="white"
        inactiveTintColor="gray"
        activeBackgroundColor="#003CB3"
        icon={({ color, size }) => (<AntDesign name="setting" size={24} color="black" />)}
        onPress={() => props.navigation.navigate('Main', { screen: 'Settings' })}
      />
      <DrawerItem
        label="About Us"
        focused={state.index === 2}
        activeTintColor="white"
        inactiveTintColor="gray"
        activeBackgroundColor="#003CB3"
        icon={({ color, size }) => (<AntDesign name="question-circle" size={24} color="black" />)}
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
  input: {
    color: "gray",
    fontSize: 16,
  },
});