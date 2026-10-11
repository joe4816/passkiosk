/* PassKiosk approved pass templates, synchronized from PrintHub corridor cleanup e61223b. */
const PKPassPdf = (() => {
// Standard PDF Helvetica metrics, in 1/1000 em. WinAnsi character codes.
const HELVETICA = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 761, 556, 0, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0, 0, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 0, 500, 667, 278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611, 667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278, 556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500];
const HELVETICA_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584, 761, 556, 0, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0, 0, 278, 278, 500, 500, 350, 556, 1000, 333, 1000, 556, 333, 944, 0, 500, 667, 278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 611, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611, 722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 556, 556, 556, 556, 556, 278, 278, 278, 278, 611, 611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611, 611, 556, 611, 556];


// A request's At Time is a wall-clock time, not its issue date.
function requestClockTime(value) {
  if (value === '' || value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1) {
    return clock(Math.round(value * 1440) % 1440);
  }
  const text = String(value).trim();
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (match) {
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    if (minute > 59 || hour > (match[3] ? 12 : 23) || (match[3] && hour < 1)) return text;
    if (match[3]) hour = hour % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
    return clock(hour * 60 + minute);
  }
  const date = value instanceof Date ? value : /^\d{4}-\d{2}-\d{2}T/.test(text) ? new Date(text) : null;
  if (!date || Number.isNaN(date.getTime())) return text;
  // Sheets encodes time-only cells against Dec 30, 1899 in standard time.
  // Use a modern standard-time date to avoid historical local-mean-time offsets.
  const instant = date.getUTCFullYear() < 1901
    ? new Date(Date.UTC(2000, 11, 30, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()))
    : date;
  return new Intl.DateTimeFormat('en-US', {timeZone:'America/Los_Angeles', hour:'numeric', minute:'2-digit'}).format(instant);
}

function clock(minutes) {
  const hour = Math.floor(minutes / 60);
  return (hour % 12 || 12) + ':' + String(minutes % 60).padStart(2, '0') + (hour >= 12 ? ' PM' : ' AM');
}



const TIME_ZONE = 'America/Los_Angeles';
const SCHOOL = 'Ernest A. Becker Sr. Middle School';

// Compatibility API for the production receipt queue and existing sample button.
function buildPassKioskReceiptPdf(transaction = {}) {
  return buildPassKioskPdf(transaction, '80MM_RECEIPT');
}

// Back Office uses ISO A6. B6 is retained only for legacy queued jobs,
// which must render with the corrected A6 geometry as well.
const PASSKIOSK_PAPER_PROFILES = Object.freeze({
  '80MM_RECEIPT': Object.freeze({widthMicrons:80000}),
  'PDF_HALF': Object.freeze({widthMicrons:215900, heightMicrons:139700}),
  'PDF_QUARTER': Object.freeze({widthMicrons:107950, heightMicrons:139700}),
  'STATEMENT': Object.freeze({widthMicrons:215900, heightMicrons:139700}),
  'A6': Object.freeze({widthMicrons:105000, heightMicrons:148000}),
  'B6': Object.freeze({widthMicrons:105000, heightMicrons:148000})
});

function buildPassKioskPdf(transaction = {}, paperProfile = '80MM_RECEIPT') {
  const profile = PASSKIOSK_PAPER_PROFILES[paperProfile];
  if (!profile) throw new Error('Unsupported PassKiosk paper profile: ' + paperProfile);
  const fixed = Boolean(profile.heightMicrons);
  const WIDTH_MICRONS = profile.widthMicrons;
  const WIDTH_PT = WIDTH_MICRONS * 72 / 25400;
  const MARGIN = ['A6','B6'].includes(paperProfile) ? 6 * 72 / 25.4 : fixed ? 12 : 4 * 72 / 25.4;
  const tx = transaction || {};
  const workflow = String(tx.Workflow || '').trim().toUpperCase();
  // Keep the approved activity-bus layout; other receipts need extra right clearance.
  const CONTENT_WIDTH = fixed ? WIDTH_PT - 2 * MARGIN : (workflow === 'BUS' ? 72 : 68) * 72 / 25.4;
  const RIGHT = MARGIN + CONTENT_WIDTH;
  const blocks = [];
  const gap = (height = 4) => blocks.push({kind:'gap', height:fixed ? height / 2 : height});
  const rule = () => blocks.push({kind:'rule', height:fixed ? 12 : 9});
  const text = (value, size = 9, bold = false, align = 'left') => {
    for (const line of wrapText(value, size, bold, CONTENT_WIDTH)) {
      blocks.push({kind:'text', text:line, size, bold, align, height:size + 3});
    }
  };
  const field = (label, value, size = 10, bold = true) => {
    if (!String(value ?? '').trim()) return;
    text(label, 7, true);
    text(value, size, bold);
    gap(4);
  };
  const writingLine = (label, withTime = false) => {
    text(label, 8, true);
    gap(fixed ? 16 : 11);
    blocks.push({kind:'writingLine', withTime, height:fixed ? 12 : 11});
  };
  const signature = (label, name) => {
    field(label, adultName(name), 10, true);
    const image = tx['Signature Raster'];
    if (image) {
      validateSignatureRaster(image);
      const scale = Math.min(1, 150 / image.width, 36 / image.height);
      blocks.push({kind:'image', image, width:image.width * scale,
        imageHeight:image.height * scale, height:image.height * scale + 5});
    } else if (fixed) gap(28);
  };
  const student = () => {
    field('STUDENT', tx['Student Name'], 12, true);
    const details = [
      tx['Student ID'] ? 'Student ID: ' + tx['Student ID'] : '',
      String(tx.Grade ?? '').trim() ? 'Grade ' + tx.Grade : ''
    ].filter(Boolean);
    text(details.join('   /   '), 8);
    gap(5);
  };

  if (workflow === 'RQST') {
    const delivery = [
      tx['Delivery Period'],
      tx['Delivery Room'] ? 'Rm ' + tx['Delivery Room'] : '',
      tx['Delivery Teacher']
    ].map(v => String(v ?? '').trim()).filter(Boolean);
    if (delivery.length) text('DELIVER TO: ' + delivery.join(' / '), 8, true);
    text(String(tx['Student Name'] || ''), 11, true, 'right');
    rule();
  }
  text(tx['School Name'] || SCHOOL, 8.5, true, 'center');
  gap(fixed ? 8 : 4);
  const title = workflowTitle(workflow);
  let titleSize = 15;
  while (textWidth(title, titleSize, true) > CONTENT_WIDTH && titleSize > 11) titleSize -= 0.5;
  text(title, titleSize, true, 'center');
  rule();
  if (workflow === 'DET' || workflow === 'LUNCH_DET') {
    text('Dear Parent/Guardian, this is to inform you that:', 8.5);
    gap(4);
  }
  if (workflow !== 'RQST') student();

  if (workflow === 'PASS') {
    field('FROM', tx.From, 10);
    field('TO', tx.To, 12);
    blocks.push({kind:'checkbox', checked:tx.Excused === true, height:17});
    field('REASON / EXCUSED FOR', tx['Reason(s)'], 9, false);
    field('ISSUED', formatDateTime(tx['Created At']), 9, false);
    signature(tx.Excused === true ? 'Excused by' : 'Signed by',
      tx['Issued By'] || tx['Session User']);
  } else if (workflow === 'RQST') {
    field('SEND STUDENT TO', tx.Destination, 12);
    field('WHEN', requestWhen(tx), 11);
    field('REASON', tx['Reason(s)'], 10, false);
    signature('Requested by', tx['Requested By'] || tx['Session User']);
    writingLine('Sent back to class by', true);
  } else if (workflow === 'DET' || workflow === 'LUNCH_DET') {
    field('ISSUED', [formatDateTime(tx['Created At']),
      adultName(tx['Issued By'] || tx['Session User'])].filter(Boolean).join(' / '), 9, false);
    field('DETENTION DATE(S)', detentionDates(tx), 11);
    field('REPORT TO', tx['Report To'] || (workflow === 'DET' ? 'Room 602' : 'The Cafeteria'), 11);
    text('Your student has been assigned a School Detention for the following infraction:', 8.5);
    gap(4);
    field('INFRACTION', tx['Reason(s)'], 9, false);
    text('Administrator Signature', 7, true);
    signature('', '');
    const directions = String(tx['Directions Snapshot'] || '').trim();
    if (directions) {
      text('DIRECTIONS', 7, true);
      for (const line of directions.split(/\r?\n/).map(x => x.trim()).filter(Boolean)) {
        text('- ' + line.replace(/^[-•]\s*/, ''), 8.5);
        gap(2);
      }
    }
    writingLine('Student Signature');
    writingLine('Parent Signature');
  } else if (workflow === 'BUS') {
    field('DATE', formatDate(tx['Created At']), 10, false);
    field('BUS ROUTE(S)', tx['Bus Route(s)'], 11);
    field('DROP-OFF', tx['Bus Drop-off(s)'], 10);
    signature('Administrator / Teacher', tx['Approved By'] || tx['Issued By'] || tx['Session User']);
  } else {
    field('WORKFLOW', workflow || 'UNKNOWN');
    field('CREATED', formatDateTime(tx['Created At']), 9, false);
    field('NOTES', tx.Notes, 9, false);
  }

  rule();
  const id = String(tx['Transaction ID'] || '').trim();
  if (id) text(id, 6.5, false, 'center');
  // Move A6 content down 5 mm, using the existing lower blank space.
  // Keep the fit scale unchanged so widths, fonts and spacing stay approved.
  const topInset = ['A6','B6'].includes(paperProfile) ? 5 * 72 / 25.4 : 0;
  const top = fixed ? 18 : 14;
  const bottom = fixed ? 14 : 18;
  const heightPt = Math.max(90000 * 72 / 25400,
    top + blocks.reduce((sum, b) => sum + b.height, 0) + bottom);
  const heightMicrons = fixed ? profile.heightMicrons : Math.ceil(heightPt * 25400 / 72 / 1000) * 1000;
  const actualHeightPt = heightMicrons * 72 / 25400;
  const blockHeight = blocks.reduce((sum, b) => sum + b.height, 0);
  const scale = fixed ? Math.min(1, (actualHeightPt - top - bottom) / blockHeight) : 1;
  if (scale < 0.7) throw new Error('Pass content is too long for ' + paperProfile + '; use Statement or receipt paper.');
  const drawingHeight = fixed ? top + blockHeight + bottom : actualHeightPt;
  let y = drawingHeight - top;
  let stream = '';
  for (const block of blocks) {
    if (block.kind === 'text') {
      const x = block.align === 'center'
        ? MARGIN + (CONTENT_WIDTH - textWidth(block.text, block.size, block.bold)) / 2
        : block.align === 'right' ? RIGHT - textWidth(block.text, block.size, block.bold) : MARGIN;
      stream += pdfText(block.text, block.size, block.bold, x, y);
    } else if (block.kind === 'rule') {
      stream += '0.5 w ' + MARGIN.toFixed(2) + ' ' + y.toFixed(2) + ' m ' +
        RIGHT.toFixed(2) + ' ' + y.toFixed(2) + ' l S\n';
    } else if (block.kind === 'checkbox') {
      const boxY = y - 8;
      stream += '0.8 w ' + MARGIN.toFixed(2) + ' ' + boxY.toFixed(2) + ' 8 8 re S\n';
      if (block.checked) stream += '1 w ' + (MARGIN + 1).toFixed(2) + ' ' + (boxY + 4).toFixed(2) +
        ' m ' + (MARGIN + 3).toFixed(2) + ' ' + (boxY + 1).toFixed(2) + ' l ' +
        (MARGIN + 7).toFixed(2) + ' ' + (boxY + 7).toFixed(2) + ' l S\n';
      stream += pdfText('EXCUSED', 9, true, MARGIN + 14, y);
    } else if (block.kind === 'image') {
      stream += 'q ' + block.width.toFixed(2) + ' 0 0 ' + block.imageHeight.toFixed(2) +
        ' ' + MARGIN.toFixed(2) + ' ' + (y - block.imageHeight).toFixed(2) + ' cm /Sig Do Q\n';
    } else if (block.kind === 'writingLine') {
      const end = RIGHT;
      const lineEnd = block.withTime ? end - 56 : end;
      stream += '0.5 w ' + MARGIN.toFixed(2) + ' ' + y.toFixed(2) + ' m ' +
        lineEnd.toFixed(2) + ' ' + y.toFixed(2) + ' l S\n';
      if (block.withTime) {
        stream += pdfText('@', 8, false, lineEnd + 6, y + 2);
        stream += (lineEnd + 20).toFixed(2) + ' ' + y.toFixed(2) + ' m ' +
          end.toFixed(2) + ' ' + y.toFixed(2) + ' l S\n';
      }
    }
    y -= block.height;
  }
  if (fixed) {
    // Preserve horizontal geometry; A6 reserves an extra 5 mm above the content.
    stream = 'q ' + scale.toFixed(6) + ' 0 0 ' + scale.toFixed(6) + ' ' +
      (MARGIN * (1 - scale)).toFixed(2) + ' ' +
      (actualHeightPt - top - topInset - (drawingHeight - top) * scale).toFixed(2) + ' cm\n' + stream + 'Q\n';
  }
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + WIDTH_PT.toFixed(2) + ' ' +
      actualHeightPt.toFixed(2) + '] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> ' +
      (blocks.some(b => b.kind === 'image') ? '/XObject << /Sig 7 0 R >> ' : '') + '>> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    '<< /Length ' + stream.length + ' >>\nstream\n' + stream + 'endstream'
  ];
  const imageBlock = blocks.find(b => b.kind === 'image');
  if (imageBlock) {
    const {width, height, grayHex} = imageBlock.image;
    const encoded = grayHex + '>';
    objects.push('<< /Type /XObject /Subtype /Image /Width ' + width + ' /Height ' + height +
      ' /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length ' + encoded.length +
      ' >>\nstream\n' + encoded + '\nendstream');
  }
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += (i + 1) + ' 0 obj\n' + obj + '\nendobj\n';
  });
  const xref = pdf.length;
  pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  pdf += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
  return {
    pageContent:stream, signatureRaster:imageBlock ? imageBlock.image : null,
    widthPt:WIDTH_PT, heightPt:actualHeightPt,
    title:title + (tx['Student Name'] ? ' - ' + tx['Student Name'] : ''),
    widthMicrons:WIDTH_MICRONS,
    heightMicrons,
    paperProfile,
    layoutScale:scale,
    pdfBase64:bytesToBase64(new TextEncoder().encode(pdf))
  };
}

function workflowTitle(workflow) {
  return ({PASS:'CORRIDOR PASS', RQST:'REQUEST FOR STUDENT', DET:'AFTER-SCHOOL DETENTION',
    LUNCH_DET:'LUNCH DETENTION', BUS:'ACTIVITY BUS PASS'})[workflow] || 'PASSKIOSK DOCUMENT';
}
function adultName(value) {
  const parts = String(value ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts.join('');
  // Already formatted initials retain every part of the surname.
  if (/^[A-Za-z]\.$/.test(parts[0])) return parts.join(' ');
  return parts[0][0] + '. ' + parts.slice(1).join(' ');
}
function requestWhen(tx) {
  const when = String(tx.When || '').trim();
  const at = requestClockTime(tx['At Time']);
  return when === 'At:' && at ? 'At ' + at : when;
}
function detentionDates(tx) {
  const dates = tx['Detention Dates'];
  if (Array.isArray(dates)) return dates.map(formatDate).filter(Boolean).join(', ');
  if (String(dates ?? '').trim()) return String(dates);
  const start = tx['Detention Date Start'] || tx['Detention Date'];
  const end = tx['Detention Date End'];
  return end && String(end) !== String(start) ? formatDate(start) + ' to ' + formatDate(end) : formatDate(start);
}
function formatDateTime(value) {
  const d = parseDate(value);
  return d ? new Intl.DateTimeFormat('en-US', {timeZone:TIME_ZONE, month:'short', day:'numeric',
    year:'numeric', hour:'numeric', minute:'2-digit'}).format(d) : String(value ?? '').trim();
}
function formatDate(value) {
  // Date-only strings have no timezone; do not shift them into the previous day.
  const str = String(value ?? '');
  const d = /^\d{4}-\d{2}-\d{2}$/.test(str) ? new Date(str + 'T12:00:00-07:00') : parseDate(value);
  return d ? new Intl.DateTimeFormat('en-US', {timeZone:TIME_ZONE, month:'short', day:'numeric',
    year:'numeric'}).format(d) : str.trim();
}
function parseDate(value) {
  if (value === '' || value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
function normalized(value) {
  return String(value ?? '').normalize('NFC').replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\u00b7/g, ' / ').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}
const WIN_ANSI = new Map([
  ['€',128], ['‚',130], ['ƒ',131], ['„',132], ['…',133], ['†',134], ['‡',135],
  ['ˆ',136], ['‰',137], ['Š',138], ['‹',139], ['Œ',140], ['Ž',142],
  ['‘',145], ['’',146], ['“',147], ['”',148], ['•',149], ['˜',152], ['™',153],
  ['š',154], ['›',155], ['œ',156], ['ž',158], ['Ÿ',159]
]);
function encodedBytes(value) {
  const result = [];
  for (const char of normalized(value)) {
    const code = char.codePointAt(0);
    if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255)) result.push(code);
    else if (WIN_ANSI.has(char)) result.push(WIN_ANSI.get(char));
    else {
      // Latin combining accents have a readable fallback. Never turn separators
      // into the unexplained question marks seen in the old receipt renderer.
      for (const fallback of char.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')) {
        const c = fallback.codePointAt(0);
        if (c >= 32 && c <= 126) result.push(c);
      }
    }
  }
  return result;
}
function textWidth(value, size, bold) {
  const metrics = bold ? HELVETICA_BOLD : HELVETICA;
  return encodedBytes(value).reduce((sum, code) => sum + (metrics[code - 32] || 556), 0) * size / 1000;
}
function wrapText(value, size, bold, width) {
  const clean = normalized(value);
  if (!clean) return [];
  const lines = [];
  let line = '';
  for (const word of clean.split(' ')) {
    const candidate = line ? line + ' ' + word : word;
    if (textWidth(candidate, size, bold) <= width) { line = candidate; continue; }
    if (line) { lines.push(line); line = ''; }
    for (const char of word) {
      if (line && textWidth(line + char, size, bold) > width) { lines.push(line); line = ''; }
      line += char;
    }
  }
  if (line) lines.push(line);
  return lines;
}
function pdfText(value, size, bold, x, y) {
  const escaped = encodedBytes(value).map(code => code < 127
    ? ([40,41,92].includes(code) ? '\\' : '') + String.fromCharCode(code)
    : '\\' + code.toString(8).padStart(3, '0')).join('');
  return 'BT\n/' + (bold ? 'F2' : 'F1') + ' ' + size + ' Tf\n' +
    x.toFixed(2) + ' ' + y.toFixed(2) + ' Td\n(' + escaped + ') Tj\nET\n';
}
function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}


function validateSignatureRaster(image) {
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 ||
      image.height < 1 || image.width > 600 || image.height > 200 ||
      typeof image.grayHex !== 'string' || !/^[0-9a-f]+$/i.test(image.grayHex) ||
      image.grayHex.length !== image.width * image.height * 2) {
    throw new Error('Invalid signature image raster.');
  }
}

// Signatures arrive only with the authenticated worker response, never as public assets.
// Flatten transparency onto white so black thermal printers retain the actual ink.
async function buildPrintablePassKioskReceiptPdf(transaction = {}) {
  return buildPrintablePassKioskPdf(transaction, '80MM_RECEIPT');
}

async function buildPrintablePassKioskPdf(transaction = {}, paperProfile = '80MM_RECEIPT') {
  const tx = {...transaction};
  const payload = tx['Signature Payload'];
  if (payload) tx['Signature Raster'] = await rasterizeSignature(payload);
  else if (tx['Signature File'] && !tx['Signature Raster']) {
    throw new Error('Stored signature image was not supplied by the backend.');
  }
  return buildPassKioskPdf(tx, paperProfile);
}

async function rasterizeSignature(payload) {
  if (!/^image\/(png|jpeg)$/.test(payload.mimeType || '') ||
      typeof payload.base64 !== 'string' || payload.base64.length > 1400000) {
    throw new Error('Unsupported signature image.');
  }
  const bytes = Uint8Array.from(atob(payload.base64), c => c.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], {type:payload.mimeType}));
  try {
    const scale = Math.min(1, 450 / bitmap.width, 108 / bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    let grayHex = '';
    for (let i = 0; i < pixels.length; i += 4) {
      const gray = Math.round(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
      grayHex += gray.toString(16).padStart(2, '0');
    }
    return {width, height, grayHex};
  } finally { bitmap.close(); }
}


return {buildPassKioskPdf,rasterizeSignature};
})();

