import { View, Text, Image, ImageBackground, ScrollView, Button } from 'react-native';
const mapImg = require("./assets/carte-geographique-du-monde.jpg");

export default function App() {
  return <View style={{flex: 1, backgroundColor: "black"}}>
        <ImageBackground source={mapImg} style={{flex: 1}}>
          <Text>Image</Text>
          <Button title="Press" color="midnightblue"/>
        </ImageBackground>
  </View>
}
