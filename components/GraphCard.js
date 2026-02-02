import {View, Text, Pressable, StyleSheet} from "react-native";

export default function GraphCard({title="Text: "}) {
    return (
        <View style={{padding: 25/2, backgroundColor: "white", borderRadius: 25, height: 100, overflow: "hidden", marginBottom: 15, flexDirection: "row"}}>
            <Text style={{fontWeight:"bold", fontSize: 40, textAlignVertical: "center", width: 100, flexDirection: "row"}}>{title}</Text>
            <View style={{backgroundColor: "lightgray", flex: 1}}>

            </View>
        </View>
    )
}
