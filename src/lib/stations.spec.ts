import { describe, expect, it } from 'vitest';
import { pickRandomStation, stationsForLines, type Station } from './stations';

const stations: Station[] = [
	{ id: '가', name: '가', lines: ['1호선'], operators: [] },
	{ id: '나', name: '나', lines: ['2호선'], operators: [] },
	{ id: '다', name: '다', lines: ['1호선', '2호선'], operators: [] }
];

describe('stationsForLines', () => {
	it('선택한 노선에 속하는 역만 반환한다', () => {
		expect(stationsForLines(stations, ['1호선']).map((station) => station.id)).toEqual([
			'가',
			'다'
		]);
	});
});

describe('pickRandomStation', () => {
	it('최근 역을 피해서 뽑는다', () => {
		expect(pickRandomStation(stations, ['가', '나'], true, () => 0)?.id).toBe('다');
	});

	it('모든 역이 최근 기록이면 전체 후보로 돌아간다', () => {
		expect(pickRandomStation(stations, ['가', '나', '다'], true, () => 0.5)?.id).toBe('나');
	});

	it('후보가 없으면 null을 반환한다', () => {
		expect(pickRandomStation([], [], true, () => 0)).toBeNull();
	});
});
