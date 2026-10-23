// Express skips every route when nothing matched and lands here.
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: { code: "not_found", message: "Route not found" },
  });
}

// Express recognizes an error handler by its four parameters.
export function errorHandler(err, req, res, next) {
  // If a response is already partly sent, hand over to Express's default handler.
  if (res.headersSent) return next(err);

  // body-parser sets err.type for problems with the request body.
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      error: {
        code: "invalid_json",
        message: "Request body is not valid JSON",
      },
    });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({
      error: {
        code: "payload_too_large",
        message: "Request body is too large",
      },
    });
  }

  // Anything else is a bug on our side: log it here, say nothing specific to the client.
  console.error(err);
  return res.status(500).json({
    error: { code: "internal_error", message: "Something went wrong" },
  });
}
