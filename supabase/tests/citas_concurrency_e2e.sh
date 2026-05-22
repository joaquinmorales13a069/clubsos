#!/usr/bin/env bash
# Test E2E de concurrencia: 10 requests paralelos al mismo slot.
# Solo 1 debe retornar 201, los otros 9 deben retornar 409 SLOT_TAKEN.
#
# Uso:
#   AUTH_COOKIE="sb-access-token=..." \
#   DOCTOR_ID=... \
#   SERVICIO_ID=... \
#   FECHA_HORA="2026-05-23T15:00:00Z" \
#   BASE_URL="http://localhost:3000" \
#   bash supabase/tests/citas_concurrency_e2e.sh
#
# Obtener la cookie desde el navegador (DevTools → Application → Cookies)
# después de loguearse como miembro.

set -e

: "${AUTH_COOKIE:?AUTH_COOKIE required}"
: "${DOCTOR_ID:?DOCTOR_ID required}"
: "${SERVICIO_ID:?SERVICIO_ID required}"
: "${FECHA_HORA:?FECHA_HORA required (ISO UTC)}"
BASE_URL="${BASE_URL:-http://localhost:3000}"

PAYLOAD=$(cat <<JSON
{
  "doctor_id":       "$DOCTOR_ID",
  "servicio_id":     "$SERVICIO_ID",
  "fecha_hora_cita": "$FECHA_HORA",
  "para_titular":    true,
  "metodo_pago":     "pago_clinica"
}
JSON
)

run_one() {
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST "$BASE_URL/api/citas" \
    -H "Content-Type: application/json" \
    -H "Cookie: $AUTH_COOKIE" \
    -d "$PAYLOAD"
}

export -f run_one
export AUTH_COOKIE DOCTOR_ID SERVICIO_ID FECHA_HORA BASE_URL PAYLOAD

echo "Disparando 10 requests en paralelo..."
RESULTS=$(seq 10 | xargs -I {} -P 10 bash -c 'run_one')
echo "$RESULTS"

COUNT_201=$(echo "$RESULTS" | grep -c '^201$' || true)
COUNT_409=$(echo "$RESULTS" | grep -c '^409$' || true)

echo ""
echo "Resumen:"
echo "  201: $COUNT_201 (esperado: 1)"
echo "  409: $COUNT_409 (esperado: 9)"

if [ "$COUNT_201" = "1" ] && [ "$COUNT_409" = "9" ]; then
  echo "PASS"
  exit 0
else
  echo "FAIL"
  exit 1
fi
