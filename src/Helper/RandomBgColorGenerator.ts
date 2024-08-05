function RandomColorGenerator(): string {
  const colors = [
    "#FF5733", // Red-Orange
    "#33FF57", // Green
    "#3357FF", // Blue
    "#F0A500", // Orange
    "#FF33A8", // Pink
    "#33FFF0", // Turquoise
    "#8E44AD", // Purple
    "#E74C3C", // Red
    "#2ECC71", // Light Green
    "#3498DB", // Light Blue
    "#F39C12", // Golden
    "#1ABC9C", // Teal
    "#D35400", // Dark Orange
    "#C0392B", // Dark Red
    "#16A085", // Deep Teal
    "#9B59B6", // Medium Purple
    "#E67E22", // Caramel
    "#F1C40F", // Yellow
    "#E74C3C", // Strong Red
    "#F39C12", // Vivid Orange
  ];
  const randomIndex = Math.floor(Math.random() * colors.length);

  // Return the color at the randomly selected index
  return colors[randomIndex];
}

export default RandomColorGenerator;
