/** 將伺服器隊伍轉成玩家視角：自己永遠藍、對手永遠紅 */

export function remapTeamForView(team, myTeam) {
  if (!team || myTeam === 'blue') return team;
  return team === 'blue' ? 'red' : 'blue';
}

export function remapBoardForView(board, myTeam) {
  if (myTeam === 'blue') return board;
  return board.map((row) =>
    row.map((unit) => (unit ? { ...unit, team: remapTeamForView(unit.team, myTeam) } : null)),
  );
}

export function remapMessageForView(message, myTeam) {
  if (!message || myTeam === 'blue') return message;
  return message
    .replaceAll('紅隊', '\u0000BLUE')
    .replaceAll('藍隊', '紅隊')
    .replaceAll('\u0000BLUE', '藍隊');
}
