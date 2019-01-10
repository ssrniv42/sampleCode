<?php
//Track24 2013
//Author : Steven Crawford
//Co Author : Jing Guan
//G.U.I v2.5
//Asset Panic Alerts Mechanics

session_start(); include $_SESSION['SYSCON_URL'];

	$owner = $_SESSION['SESS_CLIENT_ID'];
	$account_id= $_SESSION['SESS_CLIENT_ID'];
	
	$alertTime = time();
	
	$where_claus_str = "";
	$user_perm_str='';
	if($_SESSION['SESS_ACCOUNT_TYPE'] == 'user'){		
		$userId = $_SESSION['USR_USER_ID'];
		$account_id= 'u'.$userId;
		$user_perm_str= " INNER JOIN groups_assets 
							ON groups_assets.asset_id = ass.ats_id
						INNER JOIN user_group_perms 
							ON groups_assets.group_id = user_group_perms.group_id AND user_group_perms.client_id = '". 
							$owner ."' AND user_group_perms.user_id= ".$userId;
		$where_claus_str = " WHERE gps.client_id = '".$owner."' AND user_group_perms.user_id= '".$userId."' GROUP BY pr.panic_id";
	}
	else{
		$where_claus_str = " WHERE gps.client_id = '".$owner."'";
	}
	
	$qryPanicList= "SELECT '$account_id' as 'account_id', gps.*, ass.*, pr.* FROM gpsRecent gps
					INNER JOIN assets ass ON ass.cl_id= gps.client_id AND ass.iMEi= gps.asset_id
					INNER JOIN PanicReset pr ON pr.client_id= gps.client_id AND pr.asset_id = gps.asset_id".$user_perm_str.$where_claus_str.
						" ORDER BY pr.start_time DESC";
	
	//echo $qryPanicList;
	$resultPanicList = mysql_query($qryPanicList);

	$result = array();
	$status = array();

	if($resultPanicList){
		while ($row = mysql_fetch_array($resultPanicList)){
			$qryPanicAck = sprintf("SELECT * FROM PanicAck WHERE panic_id= %d", (int)$row['panic_id']);										
			$resultPanicAck = mysql_query($qryPanicAck);	
			
			$count= 0;
			if($resultPanicAck){		
				while($row2 = mysql_fetch_array($resultPanicAck)){
					$count++;
				}				
			}//end IF
			$row['ack_count']= $count;
			$result[] = $row;
		}//end while
	}
	if(!$resultPanicList){
		array_push($status , array('error'=>'Failed to get asset panic!'));
		array_push($status , array('debug'=>'Failed to get asset panic! SQL error : '.mysql_error()));
	}
	
	echo json_encode(array("result" => $result, "status" => $status));
	exit();
?>