#!/usr/bin/swift

import AppKit

let lado = 1024
let salida = CommandLine.arguments.dropFirst().first ?? "recursos/icono-1024.png"
guard let mapa = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: lado,
    pixelsHigh: lado,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
) else {
    fatalError("No se pudo crear el mapa de bits")
}

NSGraphicsContext.saveGraphicsState()
guard let contexto = NSGraphicsContext(bitmapImageRep: mapa) else {
    fatalError("No se pudo crear el contexto gráfico")
}
NSGraphicsContext.current = contexto
contexto.cgContext.translateBy(x: 0, y: CGFloat(lado))
contexto.cgContext.scaleBy(x: 1, y: -1)

func color(_ hexadecimal: UInt32, alfa: CGFloat = 1) -> NSColor {
    NSColor(
        red: CGFloat((hexadecimal >> 16) & 0xff) / 255,
        green: CGFloat((hexadecimal >> 8) & 0xff) / 255,
        blue: CGFloat(hexadecimal & 0xff) / 255,
        alpha: alfa
    )
}

let fondo = NSBezierPath(roundedRect: NSRect(x: 52, y: 52, width: 920, height: 920), xRadius: 220, yRadius: 220)
fondo.addClip()
NSGradient(colors: [color(0x1E767F), color(0x00464D), color(0x002D33)])!.draw(in: fondo, angle: -52)

NSGraphicsContext.saveGraphicsState()
let sombra = NSShadow()
sombra.shadowColor = color(0x001D21, alfa: 0.42)
sombra.shadowBlurRadius = 48
sombra.shadowOffset = NSSize(width: 0, height: -28)
sombra.set()

let filas: [(CGFloat, NSColor)] = [
    (245, color(0xFCFDFF)),
    (437, color(0x5AE7EC)),
    (629, color(0xFCFDFF)),
]
for (y, tinta) in filas {
    tinta.setFill()
    NSBezierPath(roundedRect: NSRect(x: 244, y: y, width: 536, height: 150), xRadius: 75, yRadius: 75).fill()
}
NSGraphicsContext.restoreGraphicsState()

color(0x00464D).setFill()
for y in [320, 512, 704] as [CGFloat] {
    NSBezierPath(ovalIn: NSRect(x: 295, y: y - 35, width: 70, height: 70)).fill()
}
for (y, ancho) in [(289, 282), (481, 206), (673, 250)] as [(CGFloat, CGFloat)] {
    NSBezierPath(roundedRect: NSRect(x: 404, y: y, width: ancho, height: 62), xRadius: 31, yRadius: 31).fill()
}

NSGraphicsContext.restoreGraphicsState()
guard let png = mapa.representation(using: .png, properties: [:]) else {
    fatalError("No se pudo codificar el PNG")
}
try png.write(to: URL(fileURLWithPath: salida), options: .atomic)
