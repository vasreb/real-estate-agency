import { apiErrorSchema, type ApiErrorCode } from "@agency/contracts";

/** Typed API failure; `status` 0 means the request never reached the API. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode | "NETWORK_ERROR",
  ) {
    super(code);
    this.name = "ApiError";
  }
}

export function errorFromBody(status: number, body: unknown): ApiError {
  const parsed = apiErrorSchema.safeParse(body);
  const code: ApiErrorCode = parsed.success
    ? parsed.data.code
    : "INTERNAL_ERROR";
  return new ApiError(status, code);
}

export async function toApiError(response: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // Non-JSON body (e.g. proxy error page): keep the generic code.
  }
  return errorFromBody(response.status, body);
}

export const isUnauthenticated = (error: unknown) =>
  error instanceof ApiError && error.status === 401;

/** User-facing messages; never echo server text or submitted values. */
export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError))
    return "Не удалось выполнить запрос. Повторите попытку.";
  switch (error.code) {
    case "NETWORK_ERROR":
      return "Нет связи с сервером. Проверьте подключение и повторите попытку.";
    case "UNAUTHENTICATED":
      return "Сессия завершена. Войдите снова.";
    case "FORBIDDEN":
      return "Недостаточно прав для этого действия.";
    case "NOT_FOUND":
      return "Запись не найдена или недоступна.";
    case "VALIDATION_ERROR":
      return "Проверьте правильность заполнения полей.";
    case "DOCUMENT_REFERENCED":
      return "Нельзя удалить договор, пока к нему привязаны допсоглашения. Сначала удалите или отвяжите их.";
    case "PAYLOAD_TOO_LARGE":
      return "Файл слишком большой: допускается не более 25 МБ.";
    case "UNSUPPORTED_FILE_TYPE":
      return "Допускаются только корректные файлы PDF и DOCX.";
    case "RATE_LIMITED":
      return "Слишком много попыток. Повторите позже.";
    default:
      return "Внутренняя ошибка сервера. Повторите попытку позже.";
  }
}
