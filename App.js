import { View, Text, Image, ImageBackground, ScrollView, Button, TextInput, StyleSheet, Pressable,StatusBar, ActivityIndicator, Alert} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ButtonRound from "./components/ButtonRound"
const mapImg = require("./assets/carte-geographique-du-monde.jpg");
import Entypo from '@expo/vector-icons/Entypo';
import {
  createStaticNavigation,
  useNavigation,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

const MyTabs = createBottomTabNavigator({
  screens: {
    Home: App,
    Profile: App,
  },
});
const Navigation = createStaticNavigation(MyTabs);

export default function App() {
   //Fullscreen component
  return <View style={{ flex: 1, backgroundColor: "black" }}>
      <StatusBar translucent backgroundColor="transparent" />
    <ImageBackground source={mapImg} style={{ flex: 1 }}>
      <SafeAreaView>
      <View style={{ padding: 10, justifyContent: "left", flexDirection: "row", gap: 10}}>
        <ButtonRound>
          <Entypo name="menu" size={24} color="black" />
        </ButtonRound>
      <TextInput
          style={searchBarStyle.input}
          placeholder="Search TravelSense">
      </TextInput>
      <ButtonRound name="location-pin" size={5}>
        <Entypo name="location-pin" size={24} color="black" />
      </ButtonRound>
    </View>
    </SafeAreaView>
    </ImageBackground>
  </View>
}

const searchBarStyle = StyleSheet.create({
  input: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 30,
    height: 50,
    padding: 10,
    marginHorizontal: 0,
    borderWidth: 0,
    elevation: 5,
  }
})