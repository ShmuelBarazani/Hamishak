
import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trophy, FileText, Save, Loader2, ChevronDown, ChevronUp, Lock, Unlock } from "lucide-react";
import { Question } from "@/entities/Question";
import { Prediction } from "@/entities/Prediction";
import { ValidationList } from "@/entities/ValidationList";
import { Team } from "@/entities/Team";
import { useToast } from "@/components/ui/use-toast";
import RoundTable from "../components/predictions/RoundTable";
import StandingsTable from "../components/predictions/StandingsTable";

export default function PredictionForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentUser, setCurrentUser] = useState(null); // Keeping for now, might be removed later if not used anywhere
  const [isFormLocked, setIsFormLocked] = useState(true);
  const [teams, setTeams] = useState({});
  const [validationLists, setValidationLists] = useState({});
  const [predictions, setPredictions] = useState({});
  const [participantDetails, setParticipantDetails] = useState({});
  
  const [participantQuestions, setParticipantQuestions] = useState([]);
  const [roundTables, setRoundTables] = useState([]);
  const [israeliTable, setIsraeliTable] = useState(null);
  const [specialTables, setSpecialTables] = useState([]);
  const [locationTables, setLocationTables] = useState([]);
  const [playoffWinnersTable, setPlayoffWinnersTable] = useState(null); // Ã°ÂÂÂ state ÃÂ ÃÂ¤ÃÂ¨ÃÂ ÃÂ-T19

  const [participantName, setParticipantName] = useState("");
  const [openSections, setOpenSections] = useState({});
  const [isAdmin, setIsAdmin] = useState(false); // Ã°ÂÂÂ¥ ÃÂ©ÃÂÃÂ ÃÂÃÂ
  const { toast } = useToast();
  const [selectedLocationTeams, setSelectedLocationTeams] = useState(new Set());
  const [selectedPlayoffTeams, setSelectedPlayoffTeams] = useState(new Set()); // Ã°ÂÂÂ state ÃÂ ÃÂ¤ÃÂ¨ÃÂ ÃÂ-T19

  // Ã°ÂÂÂ¥ ÃÂÃÂÃÂÃÂ§ÃÂ ÃÂÃÂ ÃÂÃÂÃÂ©ÃÂªÃÂÃÂ© ÃÂÃÂ ÃÂÃÂ
  useEffect(() => {
    const adminLoggedIn = localStorage.getItem("toto_admin_logged_in");
    setIsAdmin(adminLoggedIn === "true");
  }, []);

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    try {
      // Ã°ÂÂÂ¥ ÃÂÃÂ¡ÃÂ¨ÃÂª ÃÂÃÂÃÂ¢ÃÂÃÂ ÃÂ ÃÂ©ÃÂ ÃÂÃÂ©ÃÂªÃÂÃÂ© - ÃÂÃÂ ÃÂ¦ÃÂ¨ÃÂÃÂ
      // Removed:
      // let user = null;
      // try {
      //   user = await User.me();
      //   setCurrentUser(user);
      // } catch (e) {
      //   console.warn("No user logged in or error fetching user:", e);
      //   setCurrentUser(null);
      // }

      // ÃÂÃÂ¢ÃÂ ÃÂ¡ÃÂÃÂÃÂÃÂ¡ ÃÂ ÃÂ¢ÃÂÃÂÃÂ
      const settings = await SystemSettings.filter({ setting_key: "prediction_form_status" }, null, 1);
      if (settings.length > 0) {
        setIsFormLocked(settings[0].setting_value === "locked");
      } else {
        // Default to locked if setting not found
        setIsFormLocked(true);
      }

      const [allQuestions, allTeams, allLists] = await Promise.all([
        Question.list("-created_date", 5000),
        Team.list(null, 5000),
        ValidationList.list(null, 5000)
      ]);
        
      const teamsMap = allTeams.reduce((acc, team) => { acc[team.name] = team; return acc; }, {});
      setTeams(teamsMap);

      const listsMap = allLists.reduce((acc, list) => { acc[list.list_name] = list.options; return acc; }, {});
      setValidationLists(listsMap);

      const rTables = {}, sTables = {};
      allQuestions.forEach(q => {
        if (!q.table_id) return;
        
        if (q.table_id === 'T20' && q.question_text) {
          let teams = null;
          if (q.question_text.includes(' ÃÂ ÃÂÃÂ ')) {
            teams = q.question_text.split(' ÃÂ ÃÂÃÂ ').map(t => t.trim());
          } else if (q.question_text.includes(' - ')) {
            teams = q.question_text.split(' - ').map(t => t.trim());
          }
          
          if (teams && teams.length === 2) {
            q.home_team = teams[0];
            q.away_team = teams[1];
          }
        }

        const tableCollection = (q.home_team && q.away_team) ? rTables : sTables;
        
        // Ã°ÂÂÂ¯ ÃÂ©ÃÂÃÂ ÃÂÃÂ ÃÂ©ÃÂÃÂÃÂª T12 ÃÂ-T13 ÃÂÃÂ©ÃÂÃÂÃÂª ÃÂ§ÃÂ¦ÃÂ¨ÃÂÃÂ
        let tableDescription = q.table_description;
        if (q.table_id === 'T12') {
          tableDescription = 'ÃÂ©ÃÂÃÂ ÃÂÃÂÃÂÃÂÃÂ - ÃÂ¤ÃÂÃÂ ÃÂª ÃÂÃÂÃÂÃÂÃÂÃÂ ÃÂÃÂÃÂ©ÃÂ¨ÃÂÃÂÃÂÃÂª - 7 ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ !!!';
        } else if (q.table_id === 'T13') {
          tableDescription = 'ÃÂ©ÃÂÃÂ ÃÂ¨ÃÂÃÂ© ÃÂÃÂ¨ÃÂÃÂ© - "ÃÂÃÂÃÂÃÂ ÃÂÃÂÃÂÃÂÃÂ¨ÃÂÃÂ ÃÂ©ÃÂ ÃÂÃÂÃÂÃÂÃÂÃÂ (*)"';
        } else if (q.table_id === 'T20') { // Added T20 description
          tableDescription = 'ÃÂÃÂÃÂ¡ÃÂÃÂÃÂ "ÃÂÃÂÃÂ©ÃÂ¨ÃÂÃÂÃÂ" - ÃÂ¤ÃÂ¦ÃÂ¦ÃÂª ÃÂÃÂ ÃÂ¨ÃÂÃÂÃÂ (ÃÂÃÂÃÂ¨ÃÂÃÂ¤ÃÂÃÂª) ÃÂ¦ÃÂÃÂÃÂÃÂ';
        }
        // Ã°ÂÂÂ¥ ÃÂÃÂ¡ÃÂ¨ÃÂªÃÂ ÃÂÃÂª ÃÂÃÂ©ÃÂÃÂ ÃÂÃÂ ÃÂ©ÃÂ T19 - ÃÂ¢ÃÂÃÂ©ÃÂÃÂ ÃÂÃÂ ÃÂÃÂ§ÃÂ ÃÂÃÂª ÃÂÃÂ©ÃÂ ÃÂÃÂÃÂ§ÃÂÃÂ¨ÃÂ ÃÂÃÂÃÂ§ÃÂÃÂÃÂ¥
        
        if (!tableCollection[q.table_id]) {
          tableCollection[q.table_id] = {
            id: q.table_id,
            description: tableDescription || (q.home_team && q.away_team ? `ÃÂÃÂÃÂÃÂÃÂ¨ ${q.table_id.replace('T','')}` : `ÃÂ©ÃÂÃÂÃÂÃÂª ${q.table_id.replace('T','')}`),
            questions: []
          };
        }
        tableCollection[q.table_id].questions.push(q);
      });

      const t20Table = rTables['T20'];
      delete rTables['T20'];
      setIsraeliTable(t20Table || null);

      const participantQns = sTables['T1'] ? sTables['T1'].questions : [];
      const uniqueParticipantQns = participantQns.reduce((acc, current) => {
          if (!acc.find(item => item.question_text === current.question_text)) {
              acc.push(current);
          }
          return acc;
      }, []);
      setParticipantQuestions(uniqueParticipantQns);
      delete sTables['T1'];

      // Ã°ÂÂÂ Extract T19 (playoffWinnersTable)
      const t19Table = sTables['T19'];
      delete sTables['T19'];
      setPlayoffWinnersTable(t19Table || null);

      const sortedRoundTables = Object.values(rTables).sort((a,b) => {
        const aNum = parseInt(a.id.replace('T','')) || 0;
        const bNum = parseInt(b.id.replace('T','')) || 0;
        return aNum - bNum;
      });
      setRoundTables(sortedRoundTables);

      const locationTableIds = ['T14', 'T15', 'T16', 'T17'];
      const locationGroup = Object.values(sTables)
          .filter(table => locationTableIds.includes(table.id))
          .sort((a,b) => (parseInt(a.id.replace('T','')) || 0) - (parseInt(b.id.replace('T','')) || 0));
      setLocationTables(locationGroup);

      const allSpecialTables = Object.values(sTables).filter(table => {
          const desc = table.description?.trim();
          // Ã°ÂÂÂ Exclude T19 from general special tables
          return desc && !/^\d+$/.test(desc) && !locationTableIds.includes(table.id) && table.id !== 'T19';
      }).sort((a,b) => (parseInt(a.id.replace('T','')) || 0) - (parseInt(b.id.replace('T','')) || 0));
      
      setSpecialTables(allSpecialTables);

      // Removed block that used `user` after `User.me()` was removed:
      // if (user && user.full_name) {
      //   setParticipantName(user.full_name);
      //   const nameQuestion = uniqueParticipantQns.find(q => q.question_text?.includes("ÃÂ©ÃÂ"));
      //   if (nameQuestion) {
      //     setParticipantDetails(prev => ({ ...prev, [nameQuestion.id]: user.full_name }));
      //   }
      // }
      
    } catch (error) {
      console.error("ÃÂ©ÃÂÃÂÃÂÃÂ ÃÂÃÂÃÂ¢ÃÂÃÂ ÃÂª ÃÂÃÂ ÃÂªÃÂÃÂ ÃÂÃÂ:", error);
      toast({ title: "ÃÂ©ÃÂÃÂÃÂÃÂ", description: "ÃÂÃÂ¢ÃÂÃÂ ÃÂª ÃÂÃÂ ÃÂªÃÂÃÂ ÃÂÃÂ ÃÂ ÃÂÃÂ©ÃÂÃÂ.", variant: "destructive" });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]); 

  // Ã°ÂÂÂ¥ ÃÂ¢ÃÂÃÂÃÂÃÂ ÃÂ§ÃÂÃÂÃÂ¦ÃÂÃÂª ÃÂ©ÃÂ ÃÂÃÂÃÂ¨ÃÂ ÃÂÃÂÃÂÃÂÃÂÃÂÃÂª ÃÂÃÂÃÂ§ÃÂÃÂÃÂÃÂ T14-T17 (36 ÃÂ§ÃÂÃÂÃÂ¦ÃÂÃÂª)
  useEffect(() => {
    const mainLocationTableIds = ['T14', 'T15', 'T16', 'T17'];
    const allLocationQuestions = locationTables.flatMap(t => t.questions).filter(q => mainLocationTableIds.includes(q.table_id));

    const selected = new Set();
    allLocationQuestions.forEach(q => {
      const prediction = predictions[q.id];
      if (prediction && prediction.trim() !== '' && prediction !== '__CLEAR__') {
        selected.add(prediction);
      }
    });

    setSelectedLocationTeams(selected);
  }, [predictions, locationTables]);

  // Ã°ÂÂÂ¥ ÃÂ¢ÃÂÃÂÃÂÃÂ ÃÂ§ÃÂÃÂÃÂ¦ÃÂÃÂª ÃÂ©ÃÂ ÃÂÃÂÃÂ¨ÃÂ ÃÂ-T19 (8 ÃÂ§ÃÂÃÂÃÂ¦ÃÂÃÂª) - ÃÂÃÂ ÃÂ¤ÃÂ¨ÃÂ ÃÂÃÂÃÂÃÂ¨ÃÂ!
  useEffect(() => {
    if (!playoffWinnersTable) return;
    
    const selected = new Set();
    playoffWinnersTable.questions.forEach(q => {
      const prediction = predictions[q.id];
      if (prediction && prediction.trim() !== '' && prediction !== '__CLEAR__') {
        selected.add(prediction);
      }
    });

    setSelectedPlayoffTeams(selected);
  }, [predictions, playoffWinnersTable]);

  const toggleFormLock = async () => {
    try {
      const settings = await SystemSettings.filter({ setting_key: "prediction_form_status" }, null, 1);
      const newStatus = isFormLocked ? "open" : "locked";
      
      if (settings.length > 0) {
        await SystemSettings.update(settings[0].id, {
          setting_value: newStatus
        });
      } else {
        await SystemSettings.create({
          setting_key: "prediction_form_status",
          setting_value: newStatus,
          description: "ÃÂ¡ÃÂÃÂÃÂÃÂ¡ ÃÂÃÂÃÂ¤ÃÂ¡ ÃÂÃÂÃÂÃÂÃÂ ÃÂ ÃÂÃÂÃÂÃÂ©ÃÂÃÂ"
        });
      }
      
      setIsFormLocked(!isFormLocked);
      toast({
        title: isFormLocked ? "ÃÂÃÂÃÂÃÂ¤ÃÂ¡ ÃÂ ÃÂ¤ÃÂªÃÂ!" : "ÃÂÃÂÃÂÃÂ¤ÃÂ¡ ÃÂ ÃÂ ÃÂ¢ÃÂ!",
        description: isFormLocked ? "ÃÂÃÂ©ÃÂªÃÂªÃÂ¤ÃÂÃÂ ÃÂÃÂÃÂÃÂÃÂÃÂ ÃÂÃÂÃÂÃÂ ÃÂ ÃÂÃÂÃÂÃÂ©ÃÂÃÂ" : "ÃÂÃÂÃÂÃÂ¤ÃÂ¡ ÃÂ ÃÂ¢ÃÂÃÂ ÃÂÃÂÃÂÃÂÃÂÃÂ"
      });
    } catch (error) {
      console.error("Error toggling lock:", error);
      toast({ title: "ÃÂ©ÃÂÃÂÃÂÃÂ", description: "ÃÂ¢ÃÂÃÂÃÂÃÂ ÃÂÃÂ¡ÃÂÃÂÃÂÃÂ¡ ÃÂ ÃÂÃÂ©ÃÂ", variant: "destructive" });
    }
  };

  const handlePredictionChange = (questionId, value) => {
    setPredictions(prev => ({ ...prev, [questionId]: value === "__CLEAR__" ? "" : value }));
  };
  
  const handleDetailsChange = (questionId, value) => {
    const nameQuestion = participantQuestions.find(q => q.question_text?.includes("ÃÂ©ÃÂ"));
    if (nameQuestion && nameQuestion.id === questionId) {
      setParticipantName(value);
    }
    setParticipantDetails(prev => ({ ...prev, [questionId]: value }));
  };

  const saveAllPredictions = async () => {
    if (!participantName.trim()) {
      toast({ title: "ÃÂ©ÃÂÃÂÃÂÃÂ", description: "ÃÂ ÃÂ ÃÂÃÂÃÂÃÂ ÃÂ©ÃÂ ÃÂÃÂ¤ÃÂ¨ÃÂÃÂ ÃÂÃÂÃÂ©ÃÂªÃÂªÃÂ£.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const allPredictionsToSave = [];

      Object.entries(participantDetails).forEach(([questionId, value]) => {
        if (value && String(value).trim()) {
          allPredictionsToSave.push({
            question_id: questionId,
            participant_name: participantName.trim(),
            text_prediction: String(value).trim(),
          });
        }
      });

      Object.entries(predictions).forEach(([questionId, value]) => {
         if (value && String(value).trim()) {
           const predictionData = {
              question_id: questionId,
              participant_name: participantName.trim(),
              text_prediction: String(value).trim(),
           };
           const parts = String(value).split('-');
           if(parts.length === 2) {
              const home = parseInt(parts[0], 10);
              const away = parseInt(parts[1], 10);
              if(!isNaN(home) && !isNaN(away)){
                predictionData.home_prediction = home;
                predictionData.away_prediction = away;
              }
           }
           allPredictionsToSave.push(predictionData);
         }
      });
      
      if (allPredictionsToSave.length > 0) {
        await Prediction.bulkCreate(allPredictionsToSave);
        toast({
          title: "ÃÂ ÃÂ©ÃÂÃÂ¨ ÃÂÃÂÃÂ¦ÃÂÃÂÃÂ!",
          description: `ÃÂ ÃÂ©ÃÂÃÂ¨ÃÂ ${allPredictionsToSave.length} ÃÂ ÃÂÃÂÃÂÃÂ©ÃÂÃÂ ÃÂÃÂ¤ÃÂ¨ÃÂÃÂÃÂ.`,
        });
        setPredictions({}); 
      } else {
        toast({ title: "ÃÂÃÂÃÂ ÃÂÃÂ ÃÂÃÂ©ÃÂÃÂÃÂ¨", description: "ÃÂÃÂ ÃÂÃÂÃÂÃÂÃÂ ÃÂ ÃÂÃÂÃÂÃÂ©ÃÂÃÂ ÃÂÃÂ ÃÂ¤ÃÂ¨ÃÂÃÂÃÂ.", variant: "warning" });
      }
    } catch (error) {
      console.error("Error saving predictions:", error);
      toast({ title: "ÃÂ©ÃÂÃÂÃÂÃÂ", description: "ÃÂ©ÃÂÃÂÃÂ¨ÃÂª ÃÂÃÂ ÃÂÃÂÃÂÃÂ©ÃÂÃÂ ÃÂ ÃÂÃÂ©ÃÂÃÂ.", variant: "destructive" });
    }
    setSaving(false);
  };
  
  const toggleSection = (sectionId) => {
    setOpenSections(prev => ({...prev, [sectionId]: !prev[sectionId]}));
  };

  const renderSelectWithLogos = (question, value, onChange, customWidth = "w-[180px]") => {
    const options = validationLists[question.validation_list] || [];
    const isTeamsList = question.validation_list?.toLowerCase().includes('ÃÂ§ÃÂÃÂÃÂ¦');

    // Ã°ÂÂÂ ÃÂÃÂÃÂÃÂ§ÃÂ ÃÂÃÂ ÃÂÃÂ ÃÂ©ÃÂÃÂÃÂª ÃÂÃÂÃÂ§ÃÂÃÂ ÃÂ-T14-T17
    const isLocationQuestion = ['T14', 'T15', 'T16', 'T17'].includes(question.table_id);
    
    // Ã°ÂÂÂ ÃÂÃÂÃÂÃÂ§ÃÂ ÃÂÃÂ ÃÂÃÂ ÃÂ©ÃÂÃÂÃÂ ÃÂ-T19
    const isPlayoffWinnersQuestion = question.table_id === 'T19';

    return (
      <span style={{ display: 'inline-block', verticalAlign: 'middle' }}>
        <Select value={value || "__CLEAR__"} onValueChange={onChange}>
          <SelectTrigger className={customWidth} style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(6, 182, 212, 0.2)',
            color: '#f8fafc',
          }}>
            <SelectValue placeholder="ÃÂÃÂÃÂ¨..." />
          </SelectTrigger>
          <SelectContent style={{
            background: 'rgba(15, 23, 42, 0.9)',
            border: '1px solid rgba(6, 182, 212, 0.3)',
            color: '#f8fafc',
            backdropFilter: 'blur(5px)'
          }}>
            <SelectItem value="__CLEAR__" style={{ color: '#94a3b8' }} className="hover:bg-cyan-900/30">
              &nbsp;
            </SelectItem>
            {options.map(opt => {
              const team = isTeamsList ? teams[opt] : null;
              
              // Ã°ÂÂÂ ÃÂÃÂÃÂÃÂ§ÃÂ ÃÂÃÂ ÃÂÃÂ§ÃÂÃÂÃÂ¦ÃÂ ÃÂÃÂÃÂ¨ ÃÂ ÃÂÃÂÃÂ¨ÃÂ ÃÂÃÂÃÂÃÂÃÂÃÂÃÂª ÃÂÃÂÃÂ§ÃÂÃÂÃÂÃÂ
              const isAlreadySelectedInLocation = isLocationQuestion && 
                                       selectedLocationTeams.has(opt) && 
                                       value !== opt;
              
              // Ã°ÂÂÂ ÃÂÃÂÃÂÃÂ§ÃÂ ÃÂÃÂ ÃÂÃÂ§ÃÂÃÂÃÂ¦ÃÂ ÃÂÃÂÃÂ¨ ÃÂ ÃÂÃÂÃÂ¨ÃÂ ÃÂ-T19
              const isAlreadySelectedInPlayoff = isPlayoffWinnersQuestion && 
                                                 selectedPlayoffTeams.has(opt) && 
                                                 value !== opt;

              const isAlreadySelected = isAlreadySelectedInLocation || isAlreadySelectedInPlayoff;

              return (
                <SelectItem 
                  key={opt} 
                  value={opt} 
                  className="hover:bg-cyan-900/30"
                  disabled={isAlreadySelected}
                  style={{
                    opacity: isAlreadySelected ? 0.4 : 1,
                    cursor: isAlreadySelected ? 'not-allowed' : 'pointer'
                  }}
                >
                  <div className={`flex items-center gap-2 ${isTeamsList ? 'pl-2' : ''}`} style={isTeamsList ? { justifyContent: 'flex-start' } : {}}>
                    {team?.logo_url && (
                      <img 
                        src={team.logo_url} 
                        alt={opt} 
                        className="w-5 h-5 rounded-full flex-shrink-0" 
                        onError={(e) => e.target.style.display = 'none'}
                        style={{ opacity: isAlreadySelected ? 0.4 : 1 }}
                      />
                    )}
                    <span style={{ color: isAlreadySelected ? '#64748b' : '#f8fafc' }}>{opt}</span>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </span>
    );
  };

  const renderT10Questions = (table) => {
    const questions = table.questions;
    const grouped = {};
    
    questions.forEach(q => {
      const mainId = Math.floor(parseFloat(q.question_id));
      if (!grouped[mainId]) {
        grouped[mainId] = { main: null, subs: [] };
      }
      if (q.question_id.includes('.')) {
        grouped[mainId].subs.push(q);
      } else {
        grouped[mainId].main = q;
      }
    });

    const sortedMainIds = Object.keys(grouped).sort((a, b) => Number(a) - Number(b));

    return (
      <Card style={{
        background: 'rgba(30, 41, 59, 0.6)',
        border: '1px solid rgba(6, 182, 212, 0.2)',
        backdropFilter: 'blur(10px)'
      }}>
        <CardHeader className="py-3">
          <CardTitle style={{ color: '#06b6d4' }}>{table.description}</CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          <div className="space-y-3">
            {sortedMainIds.map(mainId => {
              const { main, subs } = grouped[mainId];
              if (!main) return null;

              const isQuestion11 = main.question_id === '11';
              const sortedSubs = [...subs].sort((a, b) => parseFloat(a.question_id) - parseFloat(b.question_id));
              
              // Ã°ÂÂÂµ ÃÂ§ÃÂÃÂÃÂ¦ÃÂ 1: ÃÂ©ÃÂÃÂÃÂÃÂª 1-2, 14-26 (ÃÂÃÂÃÂ ÃÂªÃÂªÃÂ-ÃÂ©ÃÂÃÂÃÂÃÂª)
              const isGroup1 = (mainId >= 1 && mainId <= 2) || (mainId >= 14 && mainId <= 26);
              
              // Ã°ÂÂÂ¡ ÃÂ§ÃÂÃÂÃÂ¦ÃÂ 3: ÃÂ©ÃÂÃÂÃÂ 11
              if (isQuestion11 && sortedSubs.length > 0) {
                const sub11_1 = sortedSubs.find(s => s.question_id === '11.1');
                const sub11_2 = sortedSubs.find(s => s.question_id === '11.2');
                
                return (
                  <div 
                    key={main.id} 
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '60px 180px 140px 60px 180px 140px 60px 180px 140px',
                      gap: '8px',
                      alignItems: 'center',
                      padding: '12px',
                      borderRadius: '8px',
                      background: 'rgba(15, 23, 42, 0.4)',
                      border: '1px solid rgba(6, 182, 212, 0.1)',
                      transition: 'all 0.2s ease-in-out'
                    }}
                    className="hover:bg-cyan-900/20 hover:border-cyan-700/50"
                  >
                    {/* ÃÂ©ÃÂÃÂÃÂ 11 */}
                    <Badge variant="outline" style={{
                      borderColor: 'rgba(6, 182, 212, 0.5)',
                      color: '#06b6d4',
                      minWidth: '50px'
                    }} className="justify-center">
                      {main.question_id}
                    </Badge>
                    <span className="font-medium text-sm" style={{ color: '#94a3b8' }}>
                      {main.question_text}
                    </span>
                    <span>
                      {renderSelectWithLogos(main, predictions[main.id] || "", (val) => handlePredictionChange(main.id, val), "w-[120px]")}
                    </span>

                    {/* ÃÂªÃÂª-ÃÂ©ÃÂÃÂÃÂ 11.1 */}
                    {sub11_1 && (
                      <>
                        <Badge variant="outline" style={{
                          borderColor: 'rgba(6, 182, 212, 0.5)',
                          color: '#06b6d4',
                          minWidth: '45px'
                        }} className="justify-center">
                          {sub11_1.question_id}
                        </Badge>
                        <span className="font-medium text-sm" style={{ color: '#94a3b8' }}>
                          {sub11_1.question_text}
                        </span>
                        <Input
                          value={predictions[sub11_1.id] || ""}
                          onChange={(e) => handlePredictionChange(sub11_1.id, e.target.value)}
                          className="h-9"
                          placeholder="ÃÂÃÂÃÂ ÃÂªÃÂ©ÃÂÃÂÃÂ..."
                          style={{
                            background: 'rgba(15, 23, 42, 0.6)',
                            border: '1px solid rgba(6, 182, 212, 0.2)',
                            color: '#f8fafc',
                            width: '120px'
                          }}
                        />
                      </>
                    )}

                    {/* ÃÂªÃÂª-ÃÂ©ÃÂÃÂÃÂ 11.2 - ÃÂÃÂÃÂÃÂªÃÂ ÃÂ©ÃÂÃÂ¨ÃÂ! */}
                    {sub11_2 && (
                      <>
                        <Badge variant="outline" style={{
                          borderColor: 'rgba(6, 182, 212, 0.5)',
                          color: '#06b6d4',
                          minWidth: '45px'
                        }} className="justify-center">
                          {sub11_2.question_id}
                        </Badge>
                        <span className="font-medium text-sm" style={{ color: '#94a3b8' }}>
                          {sub11_2.question_text}
                        </span>
                        <span>
                          {renderSelectWithLogos(sub11_2, predictions[sub11_2.id] || "", (val) => handlePredictionChange(sub11_2.id, val), "w-[120px]")}
                        </span>
                      </>
                    )}
                  </div>
                );
              }

              // Ã°ÂÂÂµ ÃÂ§ÃÂÃÂÃÂ¦ÃÂ 1: ÃÂªÃÂ©ÃÂÃÂÃÂÃÂª ÃÂÃÂÃÂÃÂ©ÃÂ¨ÃÂÃÂª ÃÂ¢ÃÂ ÃÂªÃÂªÃÂ-ÃÂ©ÃÂÃÂÃÂÃÂª ÃÂ©ÃÂ ÃÂ§ÃÂÃÂÃÂ¦ÃÂ 2
              else if (isGroup1 && sortedSubs.length === 0) {
                return (
                  <div 
                    key={main.id} 
                    style={{ 
                      display: 'grid',
                      gridTemplateColumns: '60px 1fr 180px',
                      gap: '8px',
                      alignItems: 'center',
                      padding: '12px',
                      borderRadius: '8px',
                      background: 'rgba(15, 23, 42, 0.4)',
                      border: '1px solid rgba(6, 182, 212, 0.1)',
                      transition: 'all 0.2s ease-in-out'
                    }}
                    className="hover:bg-cyan-900/20 hover:border-cyan-700/50"
                  >
                    <Badge variant="outline" style={{
                      borderColor: 'rgba(6, 182, 212, 0.5)',
                      color: '#06b6d4',
                      minWidth: '50px'
                    }} className="justify-center">
                      {main.question_id}
                    </Badge>
                    <span className="font-medium text-sm" style={{ color: '#94a3b8' }}>{main.question_text}</span>
                    <div>{renderSelectWithLogos(main, predictions[main.id] || "", (val) => handlePredictionChange(main.id, val), "w-[180px]")}</div>
                  </div>
                );
              }

              // Ã°ÂÂÂ¢ ÃÂ§ÃÂÃÂÃÂ¦ÃÂ 2: ÃÂÃÂ ÃÂ ÃÂÃÂÃÂ¢ÃÂÃÂ (ÃÂ©ÃÂÃÂÃÂÃÂª 3-10, 12-13 + ÃÂªÃÂªÃÂ ÃÂ©ÃÂÃÂÃÂÃÂª)
              return (
                <div 
                  key={main.id} 
                  style={{ 
                    display: 'grid',
                    gridTemplateColumns: '60px minmax(300px, 2fr) auto 50px minmax(150px, 1fr) auto',
                    gap: '8px',
                    alignItems: 'center',
                    padding: '12px',
                    borderRadius: '8px',
                    background: 'rgba(15, 23, 42, 0.4)',
                    border: '1px solid rgba(6, 182, 212, 0.1)',
                    transition: 'all 0.2s ease-in-out'
                  }}
                  className="hover:bg-cyan-900/20 hover:border-cyan-700/50"
                >
                  <Badge variant="outline" style={{
                    borderColor: 'rgba(6, 182, 212, 0.5)',
                    color: '#06b6d4',
                    minWidth: '50px'
                  }} className="justify-center">
                    {main.question_id}
                  </Badge>
                  
                  <span className="font-medium text-sm" style={{ color: '#94a3b8' }}>
                    {main.question_text}
                  </span>
                  
                  <div>
                    {renderSelectWithLogos(main, predictions[main.id] || "", (val) => handlePredictionChange(main.id, val))}
                  </div>

                  {sortedSubs.length > 0 ? (
                    <>
                      <div className="flex flex-col gap-2">
                        {sortedSubs.map(sub => (
                          <Badge key={sub.id} variant="outline" style={{
                            borderColor: 'rgba(6, 182, 212, 0.5)',
                            color: '#06b6d4',
                            minWidth: '45px'
                          }} className="justify-center">
                            {sub.question_id}
                          </Badge>
                        ))}
                      </div>
                      
                      <div className="flex flex-col gap-2">
                        {sortedSubs.map(sub => (
                          <span key={sub.id} className="font-medium text-sm" style={{ color: '#94a3b8' }}>
                            {sub.question_text}
                          </span>
                        ))}
                      </div>
                      
                      <div className="flex flex-col gap-2">
                        {sortedSubs.map(sub => (
                          <div key={sub.id}>
                            {renderSelectWithLogos(sub, predictions[sub.id] || "", (val) => handlePredictionChange(sub.id, val))}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <div></div>
                      <div></div>
                      <div></div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderSpecialQuestions = (table) => {
    const isT10 = table.description.includes('T10') || table.id === 'T10';
    
    if (isT10) {
      return renderT10Questions(table);
    }

    // ÃÂÃÂ ÃÂ©ÃÂÃÂ¨ ÃÂÃÂÃÂÃÂÃÂÃÂÃÂª - ÃÂÃÂÃÂ©ÃÂÃÂ¨ ÃÂªÃÂ§ÃÂÃÂ
    const sortedQuestions = [...table.questions].sort((a, b) => parseFloat(a.question_id) - parseFloat(b.question_id));

    return (
      <Card style={{
        background: 'rgba(30, 41, 59, 0.6)',
        border: '1px solid rgba(6, 182, 212, 0.2)',
        backdropFilter: 'blur(10px)'
      }}>
        <CardHeader className="py-3">
          <CardTitle style={{ color: '#06b6d4' }}>{table.description}</CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          <div className="space-y-2">
            {sortedQuestions.map(q => {
              const qId = parseFloat(q.question_id);
              const isCompactQuestion = (qId >= 1 && qId <= 2) || (qId >= 14 && qId <= 17);
              
              const contentRightSide = q.validation_list && validationLists[q.validation_list] ? (
                renderSelectWithLogos(q, predictions[q.id] || "", (val) => handlePredictionChange(q.id, val))
              ) : (
                <Input
                  value={predictions[q.id] || ""}
                  onChange={(e) => handlePredictionChange(q.id, e.target.value)}
                  className="h-9"
                  placeholder="ÃÂÃÂÃÂ ÃÂªÃÂ©ÃÂÃÂÃÂ..."
                  style={{
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(6, 182, 212, 0.2)',
                    color: '#f8fafc'
                  }}
                />
              );

              if (isCompactQuestion) {
                return (
                  <div key={q.id} className="p-3 rounded-lg hover:bg-cyan-900/20 hover:border-cyan-700/50" style={{
                    background: 'rgba(15, 23, 42, 0.4)',
                    border: '1px solid rgba(6, 182, 212, 0.1)',
                    transition: 'all 0.2s ease-in-out'
                  }}>
                    <div className="grid grid-cols-[auto_1fr_auto] gap-4 items-center">
                      <Badge variant="outline" style={{
                        borderColor: 'rgba(6, 182, 212, 0.5)',
                        color: '#06b6d4',
                        minWidth: '40px'
                      }} className="justify-center">
                        {q.question_id}
                      </Badge>
                      <label htmlFor={`q-${q.id}`} className="font-medium text-sm text-right" style={{ color: '#94a3b8' }}>
                        {q.question_text}
                      </label>
                      <div className="justify-self-start">{contentRightSide}</div>
                    </div>
                  </div>
                );
              }
              
              return (
                <div key={q.id} className="p-3 rounded-lg hover:bg-cyan-900/20 hover:border-cyan-700/50" style={{
                  background: 'rgba(15, 23, 42, 0.4)',
                  border: '1px solid rgba(6, 182, 212, 0.1)',
                  transition: 'all 0.2s ease-in-out'
                }}>
                  <div className="grid grid-cols-[auto_1fr_auto] gap-3 items-center">
                    <Badge variant="outline" style={{
                      borderColor: 'rgba(6, 182, 212, 0.5)',
                      color: '#06b6d4',
                      minWidth: '40px'
                    }} className="justify-center">
                      {q.question_id}
                    </Badge>
                    <label htmlFor={`q-${q.id}`} className="font-medium text-sm text-right" style={{ color: '#94a3b8' }}>
                      {q.question_text}
                    </label>
                    <div>{contentRightSide}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64" style={{ 
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        minHeight: '100vh'
      }}>
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mr-3" />
        <span className="text-blue-600">ÃÂÃÂÃÂ¢ÃÂ ÃÂ ÃÂªÃÂÃÂ ÃÂÃÂ...</span>
      </div>
    );
  }

  // Removed: const isAdmin = currentUser?.role === 'admin'; // This line is removed as isAdmin is now a state derived from localStorage

  // Ã°ÂÂÂ¥ ÃÂÃÂ ÃÂÃÂÃÂÃÂ¤ÃÂ¡ ÃÂ ÃÂ¢ÃÂÃÂ ÃÂÃÂÃÂÃÂ©ÃÂªÃÂÃÂ© ÃÂÃÂ ÃÂÃÂ ÃÂÃÂ
  if (isFormLocked && !isAdmin) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-64" style={{ 
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        minHeight: '100vh'
      }}>
        <Alert style={{ 
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: '#fca5a5'
        }} className="max-w-md">
          <Lock className="w-4 h-4" style={{ color: '#06b6d4' }} />
          <AlertDescription>
            ÃÂÃÂÃÂÃÂÃÂ ÃÂ ÃÂÃÂÃÂÃÂ©ÃÂÃÂ ÃÂ ÃÂ¢ÃÂÃÂ ÃÂÃÂ¨ÃÂÃÂ¢. ÃÂ¤ÃÂ ÃÂ ÃÂÃÂÃÂ ÃÂÃÂ ÃÂÃÂÃÂ¢ÃÂ¨ÃÂÃÂª.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const allButtons = [];

  if (roundTables.length > 0) {
    const firstRoundTableId = roundTables[0]?.id || 'T2'; 
    allButtons.push({
      numericId: parseInt(firstRoundTableId.replace('T', ''), 10),
      key: 'rounds',
      description: 'ÃÂÃÂÃÂÃÂÃÂ¨ÃÂ ÃÂÃÂÃÂ©ÃÂÃÂ§ÃÂÃÂ',
      sectionKey: 'rounds'
    });
  }

  specialTables.forEach(table => {
    allButtons.push({
      numericId: parseInt(table.id.replace('T', ''), 10),
      key: table.id,
      description: table.description,
      sectionKey: table.id
    });
  });

  if (locationTables.length > 0) {
    const firstLocationTableId = locationTables[0]?.id || 'T14';
    allButtons.push({
      numericId: parseInt(firstLocationTableId.replace('T', ''), 10),
      key: 'locations',
      description: 'ÃÂÃÂÃÂ§ÃÂÃÂÃÂÃÂ ÃÂÃÂªÃÂÃÂ ÃÂ©ÃÂÃÂ ÃÂÃÂÃÂªÃÂÃÂ',
      sectionKey: 'locations'
    });
  }

  if (israeliTable) {
    allButtons.push({
      numericId: parseInt(israeliTable.id.replace('T', ''), 10),
      key: israeliTable.id,
      description: israeliTable.description,
      sectionKey: 'israeli'
    });
  }

  // Ã°ÂÂÂ Add button for T19 (playoffWinnersTable)
  if (playoffWinnersTable) {
    allButtons.push({
      numericId: parseInt(playoffWinnersTable.id.replace('T', ''), 10),
      key: playoffWinnersTable.id,
      description: playoffWinnersTable.description,
      sectionKey: 'playoffWinners' 
    });
  }

  allButtons.sort((a, b) => a.numericId - b.numericId);

  const TEXT_LENGTH_THRESHOLD = 18; // Ã°ÂÂÂ ÃÂÃÂÃÂÃÂ¨ÃÂª ÃÂ¡ÃÂ£ ÃÂÃÂÃÂ§ÃÂ¡ÃÂ ÃÂÃÂ¨ÃÂÃÂ

  return (
    <div className="p-3 md:p-6 max-w-7xl mx-auto" dir="rtl" style={{ 
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      minHeight: '100vh'
    }}>
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 mb-4 md:mb-8">
        <div>
            <h1 className="text-xl md:text-3xl font-bold mb-1 md:mb-2 flex items-center gap-2 md:gap-3 drop-shadow-lg" style={{ 
              color: '#f8fafc',
              textShadow: '0 0 10px rgba(6, 182, 212, 0.3)'
            }}>
              <Trophy className="w-6 h-6 md:w-8 md:h-8" style={{ color: '#06b6d4' }} />
              ÃÂÃÂÃÂÃÂÃÂ ÃÂ ÃÂÃÂÃÂÃÂ©ÃÂÃÂ
            </h1>
            <p className="text-xs md:text-base" style={{ color: '#94a3b8' }}>ÃÂÃÂÃÂ ÃÂÃÂª ÃÂ¤ÃÂ¨ÃÂÃÂÃÂ ÃÂÃÂÃÂÃÂ¨ ÃÂ©ÃÂÃÂ ÃÂÃÂÃÂÃÂÃÂÃÂ ÃÂÃÂ ÃÂÃÂÃÂÃÂ©ÃÂÃÂ.</p>
        </div>
        <div className="flex gap-2 md:gap-3 w-full md:w-auto">
          {isAdmin && (
            <Button
              onClick={toggleFormLock}
              variant={isFormLocked ? "destructive" : "default"}
              className={`flex-1 md:flex-initial h-10 md:h-12 px-3 md:px-4 text-xs md:text-sm ${isFormLocked ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"} text-white`}
            >
              {isFormLocked ? (
                <>
                  <Lock className="w-4 h-4 md:w-5 md:h-5 ml-1 md:ml-2" />
                  ÃÂ ÃÂ¢ÃÂÃÂ
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4 md:w-5 md:h-5 ml-1 md:ml-2" />
                  ÃÂ¤ÃÂªÃÂÃÂ
                </>
              )}
            </Button>
          )}
          <Button onClick={saveAllPredictions} disabled={saving} size="lg" className="flex-1 md:flex-initial h-10 md:h-12 text-xs md:text-sm" style={{
            background: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
            boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)'
          }}>
            {saving ? <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin ml-1 md:ml-2" /> : <Save className="w-4 h-4 md:w-5 md:h-5 ml-1 md:ml-2" />}
            {saving ? "ÃÂ©ÃÂÃÂÃÂ¨..." : "ÃÂ©ÃÂÃÂÃÂ¨"}
          </Button>
        </div>
      </div>

      {participantQuestions.length === 0 && roundTables.length === 0 && specialTables.length === 0 && locationTables.length === 0 && !israeliTable && !playoffWinnersTable ? (
        <Alert style={{ 
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: '#fca5a5'
        }}>
          <FileText className="w-4 h-4" />
          <AlertDescription>
            ÃÂÃÂ ÃÂ ÃÂÃÂ¦ÃÂÃÂ ÃÂ©ÃÂÃÂÃÂÃÂª ÃÂÃÂÃÂ¢ÃÂ¨ÃÂÃÂª. ÃÂÃÂ ÃÂ ÃÂÃÂ¢ÃÂÃÂ ÃÂ§ÃÂÃÂ¦ÃÂÃÂ ÃÂªÃÂÃÂÃÂÃÂ ÃÂÃÂ¢ÃÂÃÂÃÂ "ÃÂÃÂ¢ÃÂÃÂÃÂª ÃÂ§ÃÂÃÂ¦ÃÂÃÂ".
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {participantQuestions.length > 0 && (
            <Card className="mb-4" style={{
              background: 'rgba(30, 41, 59, 0.6)',
              border: '1px solid rgba(6, 182, 212, 0.2)',
              backdropFilter: 'blur(10px)'
            }}>
              <CardHeader className="py-2">
                <CardTitle style={{ color: '#06b6d4' }}>ÃÂ¤ÃÂ¨ÃÂÃÂ ÃÂÃÂÃÂ©ÃÂªÃÂªÃÂ£</CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <div className="grid md:grid-cols-3 gap-3">
                  {participantQuestions.map(q => (
                    <div key={q.id}>
                      <label htmlFor={`participant-detail-${q.id}`} className="text-xs font-medium mb-1 block" style={{ color: '#94a3b8' }}>
                        {q.question_text}
                      </label>
                      <Input
                        id={`participant-detail-${q.id}`}
                        placeholder={q.question_text}
                        value={participantDetails[q.id] || ""}
                        onChange={(e) => handleDetailsChange(q.id, e.target.value)}
                        className="h-8"
                        style={{
                          background: 'rgba(15, 23, 42, 0.6)',
                          border: '1px solid rgba(6, 182, 212, 0.2)',
                          color: '#f8fafc'
                        }}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {(specialTables.length > 0 || roundTables.length > 0 || locationTables.length > 0 || israeliTable || playoffWinnersTable) && (
            <Card className="mb-4" style={{
              background: 'rgba(30, 41, 59, 0.6)',
              border: '1px solid rgba(6, 182, 212, 0.2)',
              backdropFilter: 'blur(10px)'
            }}>
               <CardHeader className="py-2">
                  <CardTitle style={{ color: '#06b6d4' }}>ÃÂÃÂÃÂÃÂ¨ÃÂª ÃÂ©ÃÂÃÂ ÃÂÃÂ ÃÂÃÂÃÂÃÂ©</CardTitle>
               </CardHeader>
               <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3">
                  {allButtons.map(button => {
                    // Ã°ÂÂÂ ÃÂÃÂÃÂ©ÃÂÃÂ ÃÂÃÂ ÃÂÃÂÃÂ§ÃÂ¡ÃÂ ÃÂÃÂ¨ÃÂÃÂ
                    const isLongText = button.description.length > TEXT_LENGTH_THRESHOLD;
                    
                    return (
                      <Button 
                        key={button.key} 
                        onClick={() => toggleSection(button.sectionKey)} 
                        variant={openSections[button.sectionKey] ? "default" : "outline"} 
                        className={`h-20 p-2 flex-col gap-2 whitespace-normal ${
                          openSections[button.sectionKey] 
                            ? 'bg-cyan-600 hover:bg-cyan-700 text-white' 
                            : 'bg-slate-700/50 hover:bg-cyan-600/20 border-cyan-400 text-cyan-200'
                        }`}
                      >
                          <span 
                            className="font-medium"
                            style={{
                              fontSize: isLongText ? '0.65rem' : '0.9rem',
                              lineHeight: isLongText ? '0.9rem' : '1.25rem'
                            }}
                          >
                            {button.description}
                          </span>
                          {openSections[button.sectionKey] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </Button>
                    );
                  })}
               </CardContent>
            </Card>
          )}

          {allButtons.map(button => {
              if (!openSections[button.sectionKey]) return null;

              if (button.sectionKey === 'rounds') {
                  return (
                      <div key="rounds-section" className="mb-6 space-y-6">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {roundTables.map(table => (
                                  <RoundTable
                                      key={table.id}
                                      table={table}
                                      teams={teams}
                                      predictions={predictions}
                                      onPredictionChange={handlePredictionChange}
                                      cardStyle={{
                                        background: 'rgba(30, 41, 59, 0.6)',
                                        border: '1px solid rgba(6, 182, 212, 0.2)',
                                        backdropFilter: 'blur(10px)'
                                      }}
                                      titleStyle={{ color: '#06b6d4' }}
                                      questionRowStyle={{
                                        background: 'rgba(15, 23, 42, 0.4)',
                                        border: '1px solid rgba(6, 182, 212, 0.1)',
                                        transition: 'all 0.2s ease-in-out'
                                      }}
                                      questionRowHoverClass="hover:bg-cyan-900/20 hover:border-cyan-700/50"
                                      badgeStyle={{
                                        borderColor: 'rgba(6, 182, 212, 0.5)',
                                        color: '#06b6d4'
                                      }}
                                      questionTextStyle={{ color: '#94a3b8' }}
                                      inputStyle={{
                                        background: 'rgba(15, 23, 42, 0.6)',
                                        border: '1px solid rgba(6, 182, 212, 0.2)',
                                        color: '#f8fafc'
                                      }}
                                  />
                              ))}
                          </div>
                          <StandingsTable 
                            roundTables={roundTables}
                            teams={teams}
                            data={predictions}
                            type="predictions"
                          />
                      </div>
                  );
              } else if (button.sectionKey === 'israeli' && israeliTable) {
                  return (
                      <div key="israeli-section" className="mb-6">
                          <RoundTable
                              table={israeliTable}
                              teams={teams}
                              predictions={predictions}
                              onPredictionChange={handlePredictionChange}
                              cardStyle={{
                                background: 'rgba(30, 41, 59, 0.6)',
                                border: '1px solid rgba(6, 182, 212, 0.2)',
                                backdropFilter: 'blur(10px)'
                              }}
                              titleStyle={{ color: '#06b6d4' }}
                              questionRowStyle={{
                                background: 'rgba(15, 23, 42, 0.4)',
                                border: '1px solid rgba(6, 182, 212, 0.1)',
                                transition: 'all 0.2s ease-in-out'
                              }}
                              questionRowHoverClass="hover:bg-cyan-900/20 hover:border-cyan-700/50"
                              badgeStyle={{
                                borderColor: 'rgba(6, 182, 212, 0.5)',
                                color: '#06b6d4'
                              }}
                              questionTextStyle={{ color: '#94a3b8' }}
                              inputStyle={{
                                background: 'rgba(15, 23, 42, 0.6)',
                                border: '1px solid rgba(6, 182, 212, 0.2)',
                                color: '#f8fafc'
                              }}
                          />
                      </div>
                  );
              } else if (button.sectionKey === 'locations') {
                  return (
                      <div key="locations-section" className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                          {locationTables.map(table => renderSpecialQuestions(table))}
                      </div>
                  );
              } else if (button.sectionKey === 'playoffWinners' && playoffWinnersTable) { // Ã°ÂÂÂ Render T19
                  return (
                      <div key="playoff-winners-section" className="mb-6">
                          {renderSpecialQuestions(playoffWinnersTable)}
                      </div>
                  );
              }
              else {
                  const specificSpecialTable = specialTables.find(t => t.id === button.key);
                  if (specificSpecialTable) {
                      return (
                          <div key={specificSpecialTable.id} className="mb-6">
                              {renderSpecialQuestions(specificSpecialTable)}
                          </div>
                      );
                  }
              }
              return null;
          })}
        </>
      )}
    </div>
  );
}
