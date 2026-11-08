// "El puente": el dibujo para presentar el evangelio, en 5 pasos.
//  1 Dios y el hombre juntos · 2 el pecado abre un abismo · 3 los esfuerzos no llegan · 4 la cruz es el puente · 5 cruzar
import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { colors } from '@/theme';

const W = 340, H = 200;
const RED = '#D64545', GREEN = '#1F6B45', BROWN = '#8B5E34', SKY = '#EAF4EE';

function Person({ x, y, color = '#1E293B' }: { x: number; y: number; color?: string }) {
  return (
    <G>
      <Circle cx={x} cy={y - 34} r={8} fill={color} />
      <Line x1={x} y1={y - 26} x2={x} y2={y - 8} stroke={color} strokeWidth={4} strokeLinecap="round" />
      <Line x1={x} y1={y - 8} x2={x - 7} y2={y} stroke={color} strokeWidth={4} strokeLinecap="round" />
      <Line x1={x} y1={y - 8} x2={x + 7} y2={y} stroke={color} strokeWidth={4} strokeLinecap="round" />
      <Line x1={x - 9} y1={y - 20} x2={x + 9} y2={y - 20} stroke={color} strokeWidth={4} strokeLinecap="round" />
    </G>
  );
}

export function Bridge({ step }: { step: number }) {
  const gap = step >= 2;
  const leftEdge = gap ? 120 : 170, rightEdge = gap ? 220 : 170;
  return (
    <View style={{ borderRadius: 14, overflow: 'hidden', backgroundColor: SKY, alignSelf: 'stretch' }}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <Rect x={0} y={0} width={W} height={H} fill={SKY} />
        {/* acantilados */}
        <Path d={`M0 120 L${leftEdge} 120 L${leftEdge - (gap ? 12 : 0)} ${H} L0 ${H} Z`} fill="#C9B79C" />
        <Path d={`M${rightEdge} 120 L${W} 120 L${W} ${H} L${rightEdge + (gap ? 12 : 0)} ${H} Z`} fill="#C9B79C" />
        {gap ? <SvgText x={170} y={175} fontSize={13} fontWeight="bold" fill={RED} textAnchor="middle">PECADO</SvgText> : null}
        {gap ? <SvgText x={170} y={192} fontSize={11} fill={RED} textAnchor="middle">muerte · separación</SvgText> : null}
        {/* Dios a la derecha */}
        <SvgText x={step >= 2 ? 285 : 205} y={70} fontSize={18} fontWeight="bold" fill={GREEN} textAnchor="middle">DIOS</SvgText>
        <Path d={`M${step >= 2 ? 285 : 205} 78 l0 34`} stroke={GREEN} strokeWidth={2} strokeDasharray="3 4" />
        {/* el hombre a la izquierda */}
        {step < 5 ? <Person x={step >= 2 ? 55 : 140} y={118} /> : null}
        <SvgText x={step >= 2 ? 55 : 140} y={74} fontSize={12} fontWeight="bold" fill="#1E293B" textAnchor="middle">{step >= 2 ? 'NOSOTROS' : ''}</SvgText>
        {/* esfuerzos que no llegan */}
        {step === 3 ? (
          <G>
            {[['Buenas obras', 40], ['Religión', 62], ['Ser bueno', 84]].map(([t, dy], i) => (
              <G key={i}>
                <Path d={`M${leftEdge} ${120 - i * 2} q 25 ${-20 + i * 6} 45 ${10 + i * 8}`} stroke={BROWN} strokeWidth={4} fill="none" strokeLinecap="round" />
                <SvgText x={leftEdge + 22} y={Number(dy)} fontSize={10} fill={BROWN} textAnchor="middle">{String(t)}</SvgText>
              </G>
            ))}
          </G>
        ) : null}
        {/* la cruz como puente */}
        {step >= 4 ? (
          <G>
            <Rect x={leftEdge - 6} y={112} width={rightEdge - leftEdge + 12} height={10} rx={2} fill={BROWN} />
            <Rect x={163} y={60} width={14} height={60} rx={2} fill={BROWN} />
            <Rect x={150} y={74} width={40} height={12} rx={2} fill={BROWN} />
            <SvgText x={170} y={54} fontSize={12} fontWeight="bold" fill={BROWN} textAnchor="middle">JESÚS</SvgText>
          </G>
        ) : null}
        {step === 5 ? <Person x={255} y={118} color={GREEN} /> : null}
        {step === 5 ? <SvgText x={255} y={140} fontSize={11} fontWeight="bold" fill={GREEN} textAnchor="middle">VIDA ETERNA</SvgText> : null}
      </Svg>
      <Text style={{ position: 'absolute', right: 8, top: 6, fontSize: 11, fontWeight: '800', color: colors.muted }}>{step} / 5</Text>
    </View>
  );
}
