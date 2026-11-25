// Las caritas para reaccionar: las que la persona usó hace poco (se recuerdan en el teléfono) y la lista completa por grupos.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { tx } from './i18n';

const KEY = 'lamies.emojis.recientes';
export const FIRST_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🙌', '🔥', '🎉', '👏'];
let recent: string[] | null = null;

/** Las últimas usadas primero; se completa con las de siempre. */
export async function recentEmojis(): Promise<string[]> {
  if (!recent) {
    try { const raw = await AsyncStorage.getItem(KEY); const p = raw ? JSON.parse(raw) : []; recent = Array.isArray(p) ? p.filter((x) => typeof x === 'string').slice(0, 24) : []; } catch { recent = []; }
  }
  return [...new Set([...recent, ...FIRST_EMOJIS])].slice(0, 24);
}
export function useEmoji(e: string): void {
  recent = [e, ...(recent ?? []).filter((x) => x !== e)].slice(0, 24);
  AsyncStorage.setItem(KEY, JSON.stringify(recent)).catch(() => undefined);
}

const g = (s: string) => s.split(' ').filter(Boolean);
export const EMOJI_GROUPS: { title: string; list: string[] }[] = [
  { get title() { return tx('Caras'); }, list: g('😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🤧 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠') },
  { get title() { return tx('Manos y personas'); }, list: g('👍 👎 👏 🙌 👐 🤲 🙏 🤝 ✊ 👊 🤛 🤜 🤞 🤟 🤘 👌 🤏 👈 👉 👆 👇 ✋ 🤚 🖐 🖖 👋 🤙 💪 ✍ 👀 👂 👃 👶 🧒 👦 👧 🧑 👨 👩 🧓 👴 👵 👪 🙋 🙇 🤦 🤷 🚶 🏃 💃 🕺') },
  { get title() { return tx('Corazones y símbolos'); }, list: g('❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 💕 💞 💓 💗 💖 💘 💝 💯 ✨ ⭐ 🌟 💫 🔥 💥 🎉 🎊 🎁 🎈 ✅ ❌ ❗ ❓ ➕ ⏰ 🔔 🎵 🎶 ✝️ 🕊 👑 📖 🙏') },
  { get title() { return tx('Naturaleza y comida'); }, list: g('☀️ 🌤 ⛅ 🌧 ⛈ 🌈 🌙 ❄️ 🌊 🌱 🌿 🌾 🌳 🌴 🌵 🌷 🌹 🌺 🌻 🌼 🍀 🐶 🐱 🐑 🐄 🐔 🐦 🐟 🦋 🐝 🍎 🍊 🍋 🍌 🍉 🍇 🍓 🍞 🧀 🍗 🍖 🍔 🍕 🌭 🥪 🌮 🍝 🍰 🎂 🍫 🍪 ☕ 🧉 🥤 💧') },
  { get title() { return tx('Cosas y lugares'); }, list: g('⛪ 🏠 🏫 🏥 🚌 🚗 🏍 🚲 ✈️ 🚀 📱 💻 📷 🎥 🎤 🎸 🎹 🥁 📚 ✏️ 📝 📅 📌 📍 💡 🔑 💰 🎓 🏆 ⚽ 🏀 🏐 🎯 🎮 🧩') },
];
