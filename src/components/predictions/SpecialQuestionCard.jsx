import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export default function SpecialQuestionCard({ title, questions, validationLists, teams, predictions, onPredictionChange }) {
  const isT10 = title.includes('T10');

  const sortedQuestions = useMemo(() => questions.sort((a, b) => {
    const aNum = parseFloat(a.question_id);
    const bNum = parseFloat(b.question_id);
    return aNum - bNum;
  }), [questions]);

  const groupedT10Questions = useMemo(() => {
    if (!isT10) return null;
    
    const groups = {};
    sortedQuestions.forEach(q => {
      const mainId = Math.floor(parseFloat(q.question_id));
      if (!groups[mainId]) {
        groups[mainId] = { main: null, subs: [] };
      }
      if (q.question_id.includes('.')) {
        groups[mainId].subs.push(q);
      } else {
        groups[mainId].main = q;
      }
    });
    return groups;
  }, [isT10, sortedQuestions]);

  const renderSelectWithLogos = (question, value, onChange) => {
    const options = validationLists[question.validation_list] || [];
    const isTeamsList = question.validation_list?.toLowerCase().includes('קבוצ');

    return (
      <span style={{ display: 'inline-block' }}>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="bg-slate-700/50 border-slate-600 text-slate-200 w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-600 text-slate-200">
            {options.map(opt => {
              const team = isTeamsList ? teams[opt] : null;
              return (
                <SelectItem key={opt} value={opt} className="hover:bg-slate-700">
                  <div className="flex items-center gap-2">
                    {team?.logo_url && (
                      <img 
                        src={team.logo_url} 
                        alt={opt} 
                        className="w-5 h-5 rounded-full" 
                        onError={(e) => e.target.style.display = 'none'}
                      />
                    )}
                    <span>{opt}</span>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </span>
    );
  };

  if (isT10) {
    const sortedMainIds = Object.keys(groupedT10Questions).sort((a, b) => Number(a) - Number(b));
    
    return (
      <Card className="bg-slate-800/40 border-slate-700">
        <CardHeader className="py-3">
          <CardTitle className="text-blue-200">{title}</CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          <div>
            {sortedMainIds.map(mainId => {
              const { main, subs } = groupedT10Questions[mainId];
              if (!main) return null;

              return (
                <div key={main.id} style={{ marginBottom: '12px', padding: '12px', borderRadius: '8px', border: '1px solid rgba(71, 85, 105, 0.3)', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                  <span style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: '8px', marginRight: '8px' }}>
                    <Badge variant="outline" className="border-blue-400 text-blue-200 w-[50px] justify-center">{main.question_id}</Badge>
                  </span>
                  <span style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: '8px', marginRight: '8px', whiteSpace: 'nowrap' }} className="font-medium text-slate-300 text-sm">{main.question_text}</span>
                  {renderSelectWithLogos(main, predictions[main.id] || "", (val) => onPredictionChange(main.id, val))}
                  {subs.map(sub => (
                    <React.Fragment key={sub.id}>
                      <span style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: '12px', marginRight: '12px' }} className="text-slate-500 text-xl">•</span>
                      <span style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: '8px', marginRight: '8px' }}>
                        <Badge variant="outline" className="border-blue-400 text-blue-200 w-[50px] justify-center">{sub.question_id}</Badge>
                      </span>
                      <span style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: '8px', marginRight: '8px', whiteSpace: 'nowrap' }} className="font-medium text-slate-300 text-sm">{sub.question_text}</span>
                      {renderSelectWithLogos(sub, predictions[sub.id] || "", (val) => onPredictionChange(sub.id, val))}
                    </React.Fragment>
                  ))}
                  {main.possible_points > 0 && (
                    <span style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '8px' }}>
                      <Badge variant="secondary" className="bg-green-700/30 text-green-200 text-xs">{main.possible_points} נק'</Badge>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-800/40 border-slate-700">
      <CardHeader className="py-3">
        <CardTitle className="text-blue-200">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-3">
        <div className="space-y-2">
          {sortedQuestions.map(q => (
            <div key={q.id} className="grid grid-cols-[auto,1fr,200px,auto] items-center gap-3 p-3 rounded-lg hover:bg-slate-700/30 border border-slate-600/30">
              <Badge variant="outline" className="border-blue-400 text-blue-200 min-w-[40px] justify-center">{q.question_id}</Badge>
              <label className="font-medium text-slate-300 text-sm">{q.question_text}</label>
              {renderSelectWithLogos(q, predictions[q.id] || "", (val) => onPredictionChange(q.id, val))}
              <div className="w-16 flex justify-start">
                {q.possible_points > 0 && <Badge variant="secondary" className="bg-green-700/30 text-green-200 text-xs whitespace-nowrap">{q.possible_points} נק'</Badge>}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}