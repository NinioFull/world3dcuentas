#!/data/data/com.termux/files/usr/bin/bash
# WORLD3D - Instalador del puente de impresoras para el celular Android (Termux), de respaldo.
# Uso: copiar la línea del Manager (Máquinas → Instalar) y pegarla en Termux. Trae la clave:
#   curl -fsSL https://world3dcuentas.vercel.app/puente/instalar-celu.sh | W3D_CLAVE=... bash
# Solo trabaja cuando la PC del taller está apagada. Arranca solo al prender el celu (con Termux:Boot).
set -e
BASE="https://world3dcuentas.vercel.app"
DIR="$HOME/world3d-puente"

echo ""
echo "  WORLD3D · Puente de impresoras (celular de respaldo)"
echo ""

# 1. Node 22 o más nuevo
version_node() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
# Termux tiene que estar al día antes: si no, el Node nuevo no arranca ("CANNOT LINK EXECUTABLE node").
if ! node -v >/dev/null 2>&1 || [ "$(version_node)" -lt 22 ]; then
  echo "Actualizando Termux e instalando Node (una sola vez, unos minutos)..."
  yes | pkg upgrade -y || true
  yes | pkg install -y nodejs || true
  if ! node -v >/dev/null 2>&1; then
    echo "Node no arranca todavía. Escribí:  yes | pkg upgrade  y después pegá de nuevo la línea del Manager."
    exit 1
  fi
fi

# 2. Programa del puente
mkdir -p "$DIR"
echo "Bajando el puente..."
curl -fsSL "$BASE/puente/puente.mjs" -o "$DIR/puente.mjs"

# 3. Clave del Manager (se lee del teclado aunque el script venga por curl | bash)
VIEJA=""
[ -f "$DIR/puente.json" ] && VIEJA=$(node -e 'try{process.stdout.write(require(process.argv[1]).clave||"")}catch{}' "$DIR/puente.json")
CLAVE="${W3D_CLAVE:-}"
while [ ${#CLAVE} -lt 16 ]; do
  if [ -n "$VIEJA" ]; then printf "Pegá la clave del puente (Enter = la misma de antes): "; else printf "Pegá la clave del puente que te muestra el Manager: "; fi
  read -r CLAVE < /dev/tty || true
  CLAVE=$(echo "$CLAVE" | tr -d '[:space:]')
  [ -z "$CLAVE" ] && CLAVE="$VIEJA"
  [ ${#CLAVE} -lt 16 ] && echo "Esa clave es muy corta. Copiala de nuevo desde el Manager."
done
# La Elegoo sin clave de acceso usa la de fábrica (el puente la prueba solo). Si le pusiste una: W3D_ELEGOO=...
ELEGOO="${W3D_ELEGOO:-}"
[ -z "$ELEGOO" ] && [ -f "$DIR/puente.json" ] && ELEGOO=$(node -e 'try{process.stdout.write(require(process.argv[1]).elegooClave||"")}catch{}' "$DIR/puente.json")
CLAVE="$CLAVE" ELEGOO="$ELEGOO" node -e '
  const c = { clave: process.env.CLAVE, fuente: "celu", servidor: process.argv[2] };
  if (process.env.ELEGOO) c.elegooClave = process.env.ELEGOO;
  require("fs").writeFileSync(process.argv[1], JSON.stringify(c, null, 2));
' "$DIR/puente.json" "$BASE/api/puente"

# 4. Probar: busca las impresoras del wifi
echo ""
echo "Buscando las impresoras en el wifi (15 s)..."
(cd "$DIR" && node puente.mjs --probar) || true

# 5. Arranque solo al prender el celu (Termux:Boot) y se levanta de nuevo si se cae
cat > "$DIR/arrancar.sh" <<EOF
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock 2>/dev/null
cd "$DIR"
while true; do node "$DIR/puente.mjs" >/dev/null 2>&1; sleep 15; done
EOF
chmod +x "$DIR/arrancar.sh"
mkdir -p "$HOME/.termux/boot"
printf '#!/data/data/com.termux/files/usr/bin/sh\nnohup "%s/arrancar.sh" >/dev/null 2>&1 &\n' "$DIR" > "$HOME/.termux/boot/world3d-puente.sh"
chmod +x "$HOME/.termux/boot/world3d-puente.sh"

# Vigilante: si Android cierra Termux, cada 15 min se vuelve a levantar el puente (necesita la app Termux:API de F-Droid)
cat > "$DIR/vigilante.sh" <<EOF
#!/data/data/com.termux/files/usr/bin/sh
pgrep -f "world3d-puente/puente.mjs" >/dev/null 2>&1 || nohup "$DIR/arrancar.sh" >/dev/null 2>&1 &
EOF
chmod +x "$DIR/vigilante.sh"
VIGILANTE="no"
if ! command -v termux-job-scheduler >/dev/null 2>&1; then yes | pkg install -y termux-api >/dev/null 2>&1 || true; fi
if command -v termux-job-scheduler >/dev/null 2>&1; then
  if timeout 15 termux-job-scheduler --job-id 7301 --script "$DIR/vigilante.sh" --period-ms 900000 --persisted true --network any >/dev/null 2>&1; then VIGILANTE="si"; fi
fi

# Cerrar uno anterior y arrancar el nuevo
pkill -f "world3d-puente/arrancar.sh" 2>/dev/null || true
pkill -f "world3d-puente/puente.mjs" 2>/dev/null || true
nohup "$DIR/arrancar.sh" >/dev/null 2>&1 &

echo ""
echo "  Listo. El celu queda de respaldo: mientras la PC esté prendida no hace nada,"
echo "  y si la apagás, en unos minutos toma el control de las impresoras."
echo "  Dejalo enchufado, en el wifi del taller, y con Termux sin restricción de batería."
if [ "$VIGILANTE" = "si" ]; then
  echo "  Vigilante activo: si Android cierra Termux, en 15 min el puente vuelve solo."
else
  echo "  Para que vuelva solo si Android cierra Termux: instalá la app Termux:API desde F-Droid"
  echo "  y pegá de nuevo esta misma línea."
fi
echo "  Registro: $DIR/puente.log"
echo ""
