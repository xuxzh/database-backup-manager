export function stringField(form: FormData, name: string) {
  return String(form.get(name) || "").trim();
}

export function optionalStringField(form: FormData, name: string) {
  const value = stringField(form, name);
  return value || undefined;
}

export function numberField(form: FormData, name: string) {
  return Number(form.get(name));
}