const PROVIDER_EXTRACTORS = {
  tv360: () => extractTv360Context(),
  fptplay: () => extractFptPlayContext(),
  generic: () => extractGenericContext()
};
