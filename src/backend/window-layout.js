function fitBounds(bounds, area) {
  const width = Math.min(440, area.width);
  const height = Math.min(760, area.height);
  const x = Number.isFinite(bounds?.x) ? bounds.x : area.x + area.width - width;
  const y = Number.isFinite(bounds?.y) ? bounds.y : area.y + area.height - height;
  return {
    width, height,
    x: Math.round(Math.max(area.x, Math.min(x, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(y, area.y + area.height - height)))
  };
}
module.exports = { fitBounds };
