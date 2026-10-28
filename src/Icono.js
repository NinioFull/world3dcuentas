// Íconos de línea en lugar de emojis: toman el color del texto (siempre de la marca)
// y se ven igual en iPhone, iPad, Android y la compu.
import {
  Printer, Hourglass, CheckCircle2, Package, Truck, FileText, Palette, Search, CalendarDays, AlertTriangle,
  Users, Timer, Weight, Archive, Lock, BellRing, Lightbulb, Trash2, Pencil, Disc3, FlaskConical, MessageCircle,
  Copy, Banknote, Wallet, Save, Smartphone, BarChart3, Upload, Flag, User, PlusCircle, PartyPopper, AlarmClock,
  Settings, TrendingUp, Clock, Calculator, Tag, Globe, Circle, Check,
} from "lucide-react";

const MAPA = {
  "🖨": Printer, "⏳": Hourglass, "✅": CheckCircle2, "📦": Package, "🚚": Truck, "📝": FileText, "🎨": Palette,
  "🔍": Search, "📅": CalendarDays, "⚠️": AlertTriangle, "⚠": AlertTriangle, "👥": Users, "⏱": Timer, "⚖": Weight,
  "🗃": Archive, "🔒": Lock, "🛎": BellRing, "💡": Lightbulb, "🗑": Trash2, "🗑️": Trash2, "✏️": Pencil, "✏": Pencil,
  "🧵": Disc3, "🧪": FlaskConical, "💬": MessageCircle, "📋": Copy, "💵": Banknote, "💰": Wallet, "💾": Save,
  "📱": Smartphone, "📊": BarChart3, "📤": Upload, "🏁": Flag, "👤": User, "➕": PlusCircle, "🎉": PartyPopper,
  "⏰": AlarmClock, "⚙️": Settings, "📈": TrendingUp, "🕐": Clock, "🧮": Calculator, "🏷": Tag, "🌐": Globe,
  "📄": FileText, "🟢": Circle, "⚫": Circle, "✓": Check,
};

export default function Icono({ e, size = 18, color, style, strokeWidth = 2 }) {
  const I = MAPA[e];
  if (!I) return null;
  return <I size={size} color={color} strokeWidth={strokeWidth} aria-hidden="true" style={{ flexShrink: 0, verticalAlign: "-0.15em", ...style }} />;
}
