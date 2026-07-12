export type LineCategory = 'metro' | 'airport' | 'light-rail' | 'gtx';

export type TransitLine = {
	name: string;
	color: string;
	category: LineCategory;
	stationCount: number;
	operators: string[];
};

export type Station = {
	id: string;
	name: string;
	lines: string[];
	operators: string[];
};

export function stationsForLines(stations: Station[], selectedLines: string[]): Station[] {
	const selected = new Set(selectedLines);
	return stations.filter((station) => station.lines.some((line) => selected.has(line)));
}

export function pickRandomStation(
	stations: Station[],
	recentIds: string[] = [],
	avoidRecent = true,
	random: () => number = Math.random
): Station | null {
	if (stations.length === 0) return null;

	const recent = new Set(recentIds);
	const fresh = avoidRecent ? stations.filter((station) => !recent.has(station.id)) : stations;
	const pool = fresh.length > 0 ? fresh : stations;
	const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
	return pool[index] ?? null;
}

export function formatSourceDate(value: string): string {
	const [year, month, day] = value.split('-');
	return `${year}.${month}.${day}`;
}
