export type Field =
  | { number: number; type: "varint"; value: number }
  | { number: number; type: "fixed64"; value: DataView }
  | { number: number; type: "bytes"; value: Uint8Array }
  | { number: number; type: "fixed32"; value: DataView };

function readVarint(buffer: Uint8Array, offset: number): [number, number] {
  let value = 0;
  let shift = 0;
  let index = offset;
  while (index < buffer.length) {
    const byte = buffer[index++]!;
    if (shift < 32) {
      value |= (byte & 0x7f) << shift;
    }
    if ((byte & 0x80) === 0) {
      return [value, index];
    }
    shift += 7;
  }
  throw new Error("Truncated protobuf varint");
}

function getView(buffer: Uint8Array, offset: number, length: number): DataView {
  if (offset + length > buffer.length) {
    throw new Error("Truncated protobuf field");
  }
  return new DataView(buffer.buffer, buffer.byteOffset + offset, length);
}

export function getFields(buffer: Uint8Array): Field[] {
  const fields: Field[] = [];
  let offset = 0;
  while (offset < buffer.length) {
    const [key, keyEnd] = readVarint(buffer, offset);
    const number = key >>> 3;
    const wireType = key & 7;
    offset = keyEnd;
    if (wireType === 0) {
      const [value, end] = readVarint(buffer, offset);
      fields.push({ number, type: "varint", value });
      offset = end;
    } else if (wireType === 1) {
      fields.push({ number, type: "fixed64", value: getView(buffer, offset, 8) });
      offset += 8;
    } else if (wireType === 2) {
      const [length, start] = readVarint(buffer, offset);
      const end = start + length;
      if (end > buffer.length) {
        throw new Error("Truncated protobuf field");
      }
      fields.push({ number, type: "bytes", value: buffer.subarray(start, end) });
      offset = end;
    } else if (wireType === 5) {
      fields.push({ number, type: "fixed32", value: getView(buffer, offset, 4) });
      offset += 4;
    } else {
      throw new Error(`Unsupported protobuf wire type ${wireType}`);
    }
  }
  return fields;
}

export function getMessage(fields: Field[], number: number): Field[] | undefined {
  const field = fields.findLast((f) => f.number === number && f.type === "bytes");
  return field?.type === "bytes" ? getFields(field.value) : undefined;
}

export function getMessages(fields: Field[], number: number): Field[][] {
  return fields.flatMap((f) =>
    f.number === number && f.type === "bytes" ? [getFields(f.value)] : [],
  );
}

export function getDouble(fields: Field[], number: number): number | undefined {
  const field = fields.findLast((f) => f.number === number && f.type === "fixed64");
  return field?.type === "fixed64" ? field.value.getFloat64(0, true) : undefined;
}

export function getInt32(fields: Field[], number: number): number | undefined {
  const field = fields.findLast((f) => f.number === number && f.type === "varint");
  return field?.type === "varint" ? field.value : undefined;
}

export function getBool(fields: Field[], number: number): boolean | undefined {
  const value = getInt32(fields, number);
  return value === undefined ? undefined : value !== 0;
}

export function getRepeatedInt32(fields: Field[], number: number): number[] {
  const values: number[] = [];
  for (const field of fields) {
    if (field.number !== number) {
      continue;
    }
    if (field.type === "varint") {
      values.push(field.value);
    } else if (field.type === "bytes") {
      let offset = 0;
      while (offset < field.value.length) {
        const [value, end] = readVarint(field.value, offset);
        values.push(value);
        offset = end;
      }
    }
  }
  return values;
}
