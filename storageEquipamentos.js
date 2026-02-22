/* Storage Equipamentos
 src/storageEquipamentos.js
 2026-02-13 - Joao Taveira (jltaveira@gmail.com) */
 
import { ref, getDownloadURL, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";

// Ajustes recomendados
export const FOTO_MAX_BYTES = 1_500_000; // 1.5MB depois de comprimido (seguro)
export const FOTO_MAX_DIM = 1280;        // maior lado (px)
export const FOTO_JPEG_QUALITY = 0.82;   // 0..1

export async function getFotoEquipamentoUrl(codigoCompleto) {
  const path = `equipamentos/${codigoCompleto}.jpg`;
  try {
    const url = await getDownloadURL(ref(storage, path));
    return { exists: true, url, path };
  } catch {
    return { exists: false, url: null, path: null };
  }
}

// Redimensiona + converte para JPG no browser (Canvas)
export async function compressToJpeg(file, { maxDim, quality }) {
  const img = await fileToImage(file);

  const { width, height } = img;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);

  const blob = await canvasToBlob(canvas, "image/jpeg", quality);
  return blob;
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function uploadFotoEquipamento({ codigoCompleto, file }) {
  // 1) bloquear se já existir
  const check = await getFotoEquipamentoUrl(codigoCompleto);
  if (check.exists) {
    return { ok: false, reason: "Já existe foto para este equipamento. Não é permitido substituir." };
  }

  // 2) comprimir/redimensionar para JPG
  const blob = await compressToJpeg(file, { maxDim: FOTO_MAX_DIM, quality: FOTO_JPEG_QUALITY });

  if (!blob) {
    return { ok: false, reason: "Falha a processar imagem." };
  }

  // 3) validar tamanho final
  if (blob.size > FOTO_MAX_BYTES) {
    return {
      ok: false,
      reason: `Foto ainda ficou grande (${Math.round(blob.size/1024)} KB). Tenta uma foto menos pesada.`,
    };
  }

  // 4) upload para path fixo .jpg
  const path = `equipamentos/${codigoCompleto}.jpg`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });

  const url = await getDownloadURL(storageRef);
  return { ok: true, url, path, size: blob.size };
}
