import './FlowTable.css';

export default function FlowTable({ ingredients, description }) {
  const steps = [];
  const seen = new Set();
  for (const ing of ingredients) {
    if (ing.step_group && !seen.has(ing.step_group)) {
      steps.push(ing.step_group);
      seen.add(ing.step_group);
    }
  }

  if (!steps.length) return null;

  // For each step, find consecutive runs of ingredients belonging to it
  const stepRuns = {};
  for (const step of steps) {
    stepRuns[step] = [];
    let i = 0;
    while (i < ingredients.length) {
      if (ingredients[i].step_group === step) {
        let span = 1;
        while (i + span < ingredients.length && ingredients[i + span].step_group === step) span++;
        stepRuns[step].push({ startRow: i, span });
        i += span;
      } else {
        i++;
      }
    }
  }

  const rows = ingredients.map((ing, rowIdx) => {
    const cells = steps.map((step) => {
      const runs = stepRuns[step];
      const runStart = runs.find((r) => r.startRow === rowIdx);
      const absorbed = runs.some((r) => rowIdx > r.startRow && rowIdx < r.startRow + r.span);
      if (runStart) return { render: true, span: runStart.span, active: true };
      if (absorbed) return { render: false };
      return { render: true, span: 1, active: false };
    });
    return { ing, cells };
  });

  const ungrouped = ingredients.filter((i) => !i.step_group);

  return (
    <div className="flow-wrap">
      <div className="flow-scroll">
        <table className="flow-table">
          <thead>
            {description && (
              <tr className="flow-prep-row">
                <td colSpan={steps.length + 1}>{description}</td>
              </tr>
            )}
            <tr>
              <th className="flow-th flow-th--ing">Ingredient</th>
              {steps.map((step) => (
                <th key={step} className="flow-th flow-th--step">{step}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ ing, cells }, rowIdx) => (
              <tr key={rowIdx}>
                <td className="flow-td flow-td--ing">
                  {(ing.amount || ing.unit) && (
                    <span className="flow-ing-amount">
                      {[ing.amount, ing.unit].filter(Boolean).join(' ')}
                    </span>
                  )}{' '}
                  <span className="flow-ing-name">{ing.name}</span>
                </td>
                {cells.map((cell, ci) => {
                  if (!cell.render) return null;
                  return (
                    <td
                      key={ci}
                      rowSpan={cell.span > 1 ? cell.span : undefined}
                      className={`flow-td flow-td--step${cell.active ? ' flow-td--active' : ''}`}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ungrouped.length > 0 && (
        <ul className="flow-ungrouped">
          {ungrouped.map((ing, i) => (
            <li key={i} className="ingredient-row">
              <span className="ing-amount">
                {[ing.amount, ing.unit].filter(Boolean).join(' ')}
              </span>
              <span className="ing-name">{ing.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
