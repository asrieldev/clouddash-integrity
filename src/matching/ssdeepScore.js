// ssdeep comparison rules: compatible block sizes, repeated-run reduction,
// shared 7-character substring and normalized insertion/deletion distance.
// Specification/reference: https://github.com/ssdeep-project/ssdeep
export function ssdeepScore(left, right) {
  const parse = value => {
    const parts = value.split(':');
    if (parts.length !== 3 || !/^\d+$/.test(parts[0])) throw new Error('Invalid ssdeep digest');
    return [Number(parts[0]), ...parts.slice(1).map(p => p.replace(/(.)\1{3,}/g, '$1$1$1'))];
  };
  const [a,x,y] = parse(left), [b,u,v] = parse(right);
  if (a === b && x === u && y === v) return 100;
  const score = (s,t,block) => {
    if (s.length < 7 || t.length < 7 || !Array.from({length:s.length-6},(_,i)=>s.slice(i,i+7)).some(part=>t.includes(part))) return 0;
    let prev = Array.from({length:t.length+1},(_,i)=>i);
    for (let i=1;i<=s.length;i++) {
      const row=[i]; for(let j=1;j<=t.length;j++) row[j]=Math.min(row[j-1]+1,prev[j]+1,prev[j-1]+(s[i-1]===t[j-1]?0:2)); prev=row;
    }
    const scaled = 100-Math.floor(Math.floor(prev[t.length]*64/(s.length+t.length))*100/64);
    return Math.min(scaled,block/3*Math.min(s.length,t.length));
  };
  if (a === b) return Math.max(score(x,u,a),score(y,v,2*a));
  if (a*2 === b) return score(y,u,b);
  if (b*2 === a) return score(x,v,a);
  return 0;
}
