#!/usr/bin/swift

import Foundation

let carpeta = URL(fileURLWithPath: CommandLine.arguments.dropFirst().first ?? "recursos/icono.iconset")
let salida = URL(fileURLWithPath: CommandLine.arguments.dropFirst(2).first ?? "recursos/icono.icns")
let representaciones = [
    ("icp4", "icon_16x16.png"),
    ("icp5", "icon_32x32.png"),
    ("icp6", "icon_32x32@2x.png"),
    ("ic07", "icon_128x128.png"),
    ("ic08", "icon_256x256.png"),
    ("ic09", "icon_512x512.png"),
    ("ic10", "icon_512x512@2x.png"),
]

func enteroGrande(_ valor: Int) -> Data {
    var entero = UInt32(valor).bigEndian
    return Data(bytes: &entero, count: MemoryLayout<UInt32>.size)
}

var bloques = Data()
for (tipo, nombre) in representaciones {
    let png = try Data(contentsOf: carpeta.appendingPathComponent(nombre))
    bloques.append(tipo.data(using: .ascii)!)
    bloques.append(enteroGrande(png.count + 8))
    bloques.append(png)
}

var icns = Data("icns".utf8)
icns.append(enteroGrande(bloques.count + 8))
icns.append(bloques)
try icns.write(to: salida, options: .atomic)
